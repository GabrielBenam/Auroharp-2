// Puente JNI + salida de audio de baja latencia (Oboe / AAudio).
#include <jni.h>
#include <oboe/Oboe.h>
#include <time.h>
#include <memory>
#include <vector>
#include "synth.h"

static ah::Synth gSynth;
static std::vector<int> gMidi;
static std::shared_ptr<oboe::AudioStream> gStream;
static std::unique_ptr<oboe::LatencyTuner> gTuner;

static double nowMs() {
    timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6;
}

class Cb : public oboe::AudioStreamDataCallback {
public:
    oboe::DataCallbackResult onAudioReady(oboe::AudioStream*, void* data, int32_t frames) override {
        gSynth.render(static_cast<float*>(data), frames, nowMs());
        if (gTuner) gTuner->tune();
        return oboe::DataCallbackResult::Continue;
    }
};
static Cb gCb;

static bool openStream() {
    oboe::AudioStreamBuilder b;
    b.setDirection(oboe::Direction::Output)
     ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
     ->setSharingMode(oboe::SharingMode::Exclusive)
     ->setFormat(oboe::AudioFormat::Float)
     ->setChannelCount(oboe::ChannelCount::Mono)
     ->setUsage(oboe::Usage::Game)
     ->setContentType(oboe::ContentType::Music)
     ->setDataCallback(&gCb);
    if (b.openStream(gStream) != oboe::Result::OK || !gStream) return false;
    gSynth.init(gStream->getSampleRate(), gMidi.data(), (int)gMidi.size());
    gStream->setBufferSizeInFrames(gStream->getFramesPerBurst() * 2);
    gTuner = std::make_unique<oboe::LatencyTuner>(*gStream);
    return gStream->requestStart() == oboe::Result::OK;
}

extern "C" {

JNIEXPORT void JNICALL Java_lab_autoarpa_Native_setTuning(JNIEnv* env, jobject, jintArray arr) {
    jsize n = env->GetArrayLength(arr);
    gMidi.assign(n, 60);
    env->GetIntArrayRegion(arr, 0, n, gMidi.data());
}
JNIEXPORT jboolean JNICALL Java_lab_autoarpa_Native_start(JNIEnv*, jobject) {
    if (gStream) return JNI_TRUE;
    if (gMidi.empty()) return JNI_FALSE;
    return openStream() ? JNI_TRUE : JNI_FALSE;
}
JNIEXPORT void JNICALL Java_lab_autoarpa_Native_stop(JNIEnv*, jobject) {
    if (gStream) { gStream->stop(); gStream->close(); gStream.reset(); gTuner.reset(); }
}
JNIEXPORT void JNICALL Java_lab_autoarpa_Native_pluck(JNIEnv*, jobject, jint idx, jfloat vel, jint offsetUs, jdouble tMs) {
    gSynth.pluck(idx, vel, offsetUs, tMs);
}
JNIEXPORT void JNICALL Java_lab_autoarpa_Native_damp(JNIEnv*, jobject, jint idx, jint offsetUs) {
    gSynth.damp(idx, offsetUs);
}
JNIEXPORT void JNICALL Java_lab_autoarpa_Native_setMask(JNIEnv*, jobject, jlong m) {
    gSynth.setMask((uint64_t)m);
}
JNIEXPORT void JNICALL Java_lab_autoarpa_Native_getLevels(JNIEnv* env, jobject, jfloatArray arr) {
    float t[ah::kStrings]; gSynth.getLevels(t);
    env->SetFloatArrayRegion(arr, 0, ah::kStrings, t);
}
JNIEXPORT void JNICALL Java_lab_autoarpa_Native_resetStats(JNIEnv*, jobject) { gSynth.resetStats(); }
JNIEXPORT jdouble JNICALL Java_lab_autoarpa_Native_nowMs(JNIEnv*, jobject) { return nowMs(); }

// out: 0 sw ultima, 1 sw media, 2 sw maxima, 3 latencia de salida (ms, -1 si no hay), 4 frecuencia de muestreo,
// 5 cuadros por rafaga, 6 buffer actual, 7 xruns, 8 modo baja latencia (1/0), 9 exclusivo (1/0), 10 API (1 AAudio, 2 OpenSL)
JNIEXPORT void JNICALL Java_lab_autoarpa_Native_stats(JNIEnv* env, jobject, jdoubleArray arr) {
    double o[11] = {gSynth.latLast(), gSynth.latAvg(), gSynth.latMax(), -1, 0, 0, 0, 0, 0, 0, 0};
    if (gStream) {
        auto l = gStream->calculateLatencyMillis();
        if (l) o[3] = l.value();
        o[4] = gStream->getSampleRate(); o[5] = gStream->getFramesPerBurst(); o[6] = gStream->getBufferSizeInFrames();
        auto x = gStream->getXRunCount(); if (x) o[7] = x.value();
        o[8] = gStream->getPerformanceMode() == oboe::PerformanceMode::LowLatency ? 1 : 0;
        o[9] = gStream->getSharingMode() == oboe::SharingMode::Exclusive ? 1 : 0;
        o[10] = gStream->getAudioApi() == oboe::AudioApi::AAudio ? 1 : 2;
    }
    env->SetDoubleArrayRegion(arr, 0, 11, o);
}

}
