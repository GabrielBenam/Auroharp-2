// Nucleo de sintesis de la autoarpa: 36 cuerdas Karplus-Strong persistentes.
// Sin dependencias de Android: se prueba offline en PC (tests/synth_test.cpp).
#pragma once
#include <atomic>
#include <cstdint>
#include <cmath>
#include <cstring>

namespace ah {

constexpr int kStrings = 36;
constexpr int kBuf = 4096;        // admite hasta 96 kHz con F2
constexpr int kQueue = 1024;      // cola entre hilo de UI y audio (potencia de 2)
constexpr int kPending = 512;

enum EvType : int { EV_PLUCK = 1, EV_DAMP = 2 };

struct Event {
    int type; int idx; float vel; int offsetFrames; double tMs; // tMs: hora del toque (CLOCK_MONOTONIC, ms)
};

struct Voice {
    float buf[kBuf];
    int len = 100, pos = 0;
    float apA = 0, apX = 0, apY = 0;   // pasa-todo de afinacion fina
    float lp = 0;                       // filtro de excitacion
    float rho = 0.999f, rhoDamp = 0.9f;
    float freq = 100.f;
    bool active = false, damped = false;
    float level = 0.f;                  // seguidor de pico (para la interfaz)
};

class Synth {
public:
    void init(int sampleRate, const int* midi, int n);
    // Hilo de UI (un solo productor):
    bool pluck(int idx, float vel, int offsetUs, double tMs);
    bool damp(int idx, int offsetUs);
    void setMask(uint64_t openMask) { mask_.store(openMask, std::memory_order_relaxed); }
    // Hilo de audio:
    void render(float* out, int frames, double nowMs);
    // Lectura desde UI:
    void getLevels(float* dst36) const { for (int i = 0; i < kStrings; i++) dst36[i] = lvl_[i].load(std::memory_order_relaxed); }
    double latLast() const { return latLast_.load(); }
    double latAvg() const { return latAvg_.load(); }
    double latMax() const { return latMax_.load(); }
    void resetStats() { latMax_ = 0; latAvg_ = 0; latLast_ = 0; }
    int sampleRate() const { return sr_; }
    float master = 0.22f;

private:
    void applyEvent(const Event& e);
    void doPluck(int i, float vel);
    void doDamp(int i);
    void chunk(float* out, int n);

    int sr_ = 48000;
    Voice* v_ = nullptr;
    int nStr_ = kStrings;
    uint32_t rng_ = 2463534242u;
    uint64_t prevMask_ = ~0ull;
    std::atomic<uint64_t> mask_{~0ull};
    Event q_[kQueue];
    std::atomic<uint32_t> qh_{0}, qt_{0};
    Event pend_[kPending]; int nPend_ = 0;
    std::atomic<float> lvl_[kStrings];
    std::atomic<double> latLast_{0}, latAvg_{0}, latMax_{0};
    float rnd() { rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5; return (rng_ & 0xFFFFFF) / 8388608.0f - 1.0f; }
};

} // namespace ah
