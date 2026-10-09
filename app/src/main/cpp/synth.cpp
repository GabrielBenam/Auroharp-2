#include "synth.h"
#include <algorithm>
#include <cstdlib>

namespace ah {

void Synth::init(int sampleRate, const int* midi, int n) {
    sr_ = std::min(std::max(sampleRate, 8000), 96000);
    nStr_ = std::min(n, kStrings);
    if (!v_) v_ = new Voice[kStrings];
    for (int i = 0; i < kStrings; i++) {
        Voice& v = v_[i];
        std::memset(v.buf, 0, sizeof(v.buf));
        int m = i < nStr_ ? midi[i] : 60;
        v.freq = 440.0f * std::pow(2.0f, (m - 69) / 12.0f);
        double D = sr_ / (double)v.freq + 0.5;           // el promediador usa la muestra siguiente: adelanta 0.5
        int L = (int)std::floor(D); double d = D - L;
        if (d < 0.5) { L -= 1; d += 1.0; }
        v.len = std::max(2, std::min(L, kBuf - 1));
        {   // el retardo del pasa-todo cae con la frecuencia: se resuelve 'a' con su retardo de fase real a f
            const double w = 2.0 * M_PI * v.freq / sr_;
            auto tau = [&](double a) { double ph = std::atan2(-std::sin(w), a + std::cos(w)) - std::atan2(-a * std::sin(w), 1.0 + a * std::cos(w)); return -ph / w; };
            double lo = -0.9, hi = 0.9;                       // tau decrece con a
            for (int it = 0; it < 60; it++) { double mid = 0.5 * (lo + hi); if (tau(mid) > d) lo = mid; else hi = mid; }
            v.apA = (float)(0.5 * (lo + hi));
        }
        double t60 = 9.0 - 4.0 * (m - 41) / 43.0;        // graves duran mas (9 s a 5 s)
        v.rho = (float)std::pow(10.0, -3.0 / (v.freq * t60));
        v.rhoDamp = (float)std::exp(-1.0 / (v.freq * 0.012)); // fieltro/dedo: constante de ~12 ms
        v.pos = 0; v.apX = v.apY = v.lp = 0; v.active = false; v.damped = false; v.level = 0;
        lvl_[i].store(0);
    }
    qh_ = qt_ = 0; nPend_ = 0; prevMask_ = ~0ull;
}

bool Synth::pluck(int idx, float vel, int offsetUs, double tMs) {
    uint32_t h = qh_.load(std::memory_order_relaxed), t = qt_.load(std::memory_order_acquire);
    if (h - t >= (uint32_t)kQueue) return false;
    q_[h & (kQueue - 1)] = Event{EV_PLUCK, idx, vel, (int)((int64_t)offsetUs * sr_ / 1000000), tMs};
    qh_.store(h + 1, std::memory_order_release);
    return true;
}

bool Synth::damp(int idx, int offsetUs) {
    uint32_t h = qh_.load(std::memory_order_relaxed), t = qt_.load(std::memory_order_acquire);
    if (h - t >= (uint32_t)kQueue) return false;
    q_[h & (kQueue - 1)] = Event{EV_DAMP, idx, 0.f, (int)((int64_t)offsetUs * sr_ / 1000000), -1};
    qh_.store(h + 1, std::memory_order_release);
    return true;
}

void Synth::doPluck(int i, float vel) {
    if (i < 0 || i >= nStr_) return;
    if (!((prevMask_ >> i) & 1ull)) return;               // cuerda bajo fieltro: no suena
    Voice& v = v_[i];
    vel = std::min(1.f, std::max(0.05f, vel));
    float a = 0.35f + 0.6f * vel;                          // suave = mas oscura
    float keep = v.active && !v.damped ? 0.4f : 0.f;       // re-pulsar una cuerda viva suma energia
    float mean = 0, tmp[kBuf]; int L = v.len;
    float lp = 0;
    for (int k = 0; k < L; k++) { float x = rnd(); lp += a * (x - lp); tmp[k] = lp; mean += lp; }
    mean /= L;
    for (int k = 0; k < L; k++) v.buf[(v.pos + k) % L] = keep * v.buf[(v.pos + k) % L] + (tmp[k] - mean) * vel * 1.4f;
    v.damped = false; v.active = true;
}

void Synth::doDamp(int i) {
    if (i < 0 || i >= nStr_) return;
    v_[i].damped = true;
}

void Synth::applyEvent(const Event& e) {
    if (e.type == EV_PLUCK) doPluck(e.idx, e.vel); else doDamp(e.idx);
}

void Synth::chunk(float* out, int n) {
    for (int i = 0; i < nStr_; i++) {
        Voice& v = v_[i];
        if (!v.active) continue;
        const float r = v.damped ? v.rhoDamp : v.rho;
        const int L = v.len; const float a = v.apA;
        int pos = v.pos; float peak = 0;
        for (int s = 0; s < n; s++) {
            int nx = pos + 1; if (nx >= L) nx = 0;
            float y = v.buf[pos];
            float x = 0.5f * (y + v.buf[nx]) * r;          // promediador con perdida
            float ap = a * x + v.apX - a * v.apY;          // afinacion fraccional
            v.apX = x; v.apY = ap;
            v.buf[pos] = ap;
            out[s] += y;
            float ay = y < 0 ? -y : y; if (ay > peak) peak = ay;
            pos = nx;
        }
        v.pos = pos;
        v.level = std::max(peak, v.level * 0.995f);
        if (v.level < 1e-5f) { v.active = false; std::memset(v.buf, 0, sizeof(float) * L); v.apX = v.apY = 0; v.level = 0; }
    }
}

void Synth::render(float* out, int frames, double nowMs) {
    if (!v_) { std::memset(out, 0, sizeof(float) * frames); return; }
    // 1) cambios de fieltro: lo que queda tapado se apaga al instante
    uint64_t m = mask_.load(std::memory_order_relaxed);
    uint64_t closedNow = prevMask_ & ~m;
    for (int i = 0; i < nStr_; i++) if ((closedNow >> i) & 1ull) doDamp(i);
    prevMask_ = m;
    // 2) vaciar la cola a la lista de pendientes
    uint32_t t = qt_.load(std::memory_order_relaxed), h = qh_.load(std::memory_order_acquire);
    while (t != h && nPend_ < kPending) {
        Event e = q_[t & (kQueue - 1)];
        if (e.type == EV_PLUCK && e.tMs > 0 && e.offsetFrames == 0) {
            double lat = std::max(0.0, nowMs - e.tMs);
            latLast_.store(lat);
            latAvg_.store(latAvg_.load() == 0 ? lat : latAvg_.load() * 0.9 + lat * 0.1);
            if (lat > latMax_.load()) latMax_.store(lat);
        }
        pend_[nPend_++] = e; t++;
    }
    qt_.store(t, std::memory_order_release);
    // 3) render por tramos, aplicando cada evento en su cuadro exacto
    std::memset(out, 0, sizeof(float) * frames);
    int pos = 0;
    while (pos < frames) {
        int next = frames - pos;
        for (int k = 0; k < nPend_; k++) if (pend_[k].offsetFrames > 0) next = std::min(next, pend_[k].offsetFrames);
        { int w = 0;   // aplica los vencidos conservando el orden de llegada
          for (int k = 0; k < nPend_; k++) {
              if (pend_[k].offsetFrames <= 0) applyEvent(pend_[k]); else pend_[w++] = pend_[k];
          }
          nPend_ = w; }
        chunk(out + pos, next);
        for (int k = 0; k < nPend_; k++) pend_[k].offsetFrames -= next;
        pos += next;
    }
    // 4) mezcla final con saturacion suave y niveles para la interfaz
    for (int s = 0; s < frames; s++) { float x = out[s] * master; out[s] = x / (1.f + std::fabs(x)); }
    for (int i = 0; i < nStr_; i++) lvl_[i].store(v_[i].level, std::memory_order_relaxed);
}

} // namespace ah
