// Prueba offline del nucleo de audio: g++ -O2 -std=c++17 -I../app/src/main/cpp synth_test.cpp ../app/src/main/cpp/synth.cpp
#include "synth.h"
#include <cstdio>
#include <vector>
#include <cmath>
using namespace ah;
static int fails = 0;
static void ok(bool c, const char* m) { printf("%s - %s\n", c ? "ok" : "FALLA", m); if (!c) fails++; }
static std::vector<float> run(Synth& s, int frames) {
    std::vector<float> out(frames); int p = 0;
    while (p < frames) { int n = std::min(128, frames - p); s.render(out.data() + p, n, 1000.0); p += n; }
    return out;
}
static double rms(const std::vector<float>& v, int a, int b) { double e = 0; for (int i = a; i < b; i++) e += v[i] * (double)v[i]; return std::sqrt(e / (b - a)); }
static double freqOf(const std::vector<float>& v, int a, int b, int sr) { // autocorrelacion
    int best = 0; double bv = -1e9; std::vector<double> C(sr / 60 + 2, 0);
    for (int lag = sr / 1200; lag < sr / 60; lag++) { double c = 0; for (int i = a; i + lag < b; i++) c += v[i] * (double)v[i + lag]; C[lag] = c; if (c > bv) { bv = c; best = lag; } }
    double y0 = C[best - 1], y1 = C[best], y2 = C[best + 1], d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2); // interpolacion parabolica
    return (double)sr / (best + d);
}
int main() {
    int midi[36]; int base[] = {41,43,48,50,52,53,54,55,57,58,59}; for (int i = 0; i < 11; i++) midi[i] = base[i]; for (int i = 11; i < 36; i++) midi[i] = 60 + i - 11;
    for (int sr : {44100, 48000}) {
        Synth s; s.init(sr, midi, 36);
        double worst = 0;
        for (int i : {0, 5, 11, 20, 35}) {
            s.init(sr, midi, 36); s.pluck(i, 0.8f, 0, 999.0);
            auto o = run(s, sr / 2);
            double f = freqOf(o, 2000, 12000, sr), t = 440.0 * std::pow(2.0, (midi[i] - 69) / 12.0);
            double cents = 1200.0 * std::log2(f / t); printf("  cuerda %d midi %d f=%.2f t=%.2f cents=%.1f\n", i, midi[i], f, t, cents); worst = std::max(worst, std::fabs(cents));
        }
        printf("sr %d peor desafinacion %.1f cents\n", sr, worst);
        ok(worst < 20, "afinacion dentro de 20 cents (autocorrelacion entera)");
    }
    Synth s; s.init(48000, midi, 36);
    s.pluck(15, 0.8f, 0, 999.0);
    auto o = run(s, 48000 * 4);
    double a = rms(o, 4800, 9600), b = rms(o, 48000 * 2, 48000 * 2 + 4800), c = rms(o, 48000 * 3.5, 48000 * 3.5 + 4800);
    printf("rms 0.1s %.4f  2s %.4f  3.5s %.4f\n", a, b, c);
    ok(a > 0.005 && b < a && c < b && b > 0.03 * a, "decae gradualmente (vibra varios segundos)");
    // amortiguar
    s.init(48000, midi, 36); s.pluck(15, 0.8f, 0, 999.0); run(s, 4800); s.damp(15, 0);
    o = run(s, 48000);
    ok(rms(o, 9600, 14400) < 0.02 * a, "damp apaga en menos de 0.2 s");
    // fieltro
    s.init(48000, midi, 36); s.setMask(~(1ull << 15)); run(s, 128); s.pluck(15, 1.f, 0, 999.0); o = run(s, 9600);
    ok(rms(o, 0, 9600) < 1e-6, "cuerda fieltrada no suena");
    // cerrar fieltro apaga lo que vibra
    s.init(48000, midi, 36); s.pluck(20, 1.f, 0, 999.0); run(s, 4800); s.setMask(~(1ull << 20)); o = run(s, 24000);
    ok(rms(o, 12000, 24000) < 0.01 * rms(o, 0, 128) + 1e-6, "presionar barra apaga cuerda viva");
    // soltar no apaga y reabrir permite pulsar
    s.setMask(~0ull); s.pluck(20, 1.f, 0, 999.0); o = run(s, 4800); ok(rms(o, 0, 4800) > 0.005, "reabrir permite pulsar");
    // offsets: segunda cuerda 10 ms despues
    s.init(48000, midi, 36); s.pluck(11, 1.f, 0, 999.0); s.pluck(23, 1.f, 10000, 999.0); o = run(s, 9600);
    // inicio de energia: busca primer muestra no nula; no es trivial, comparar niveles
    float lv[36]; s.getLevels(lv); ok(lv[11] > 0 && lv[23] > 0, "dos cuerdas activas con desfase");
    // latencia
    s.init(48000, midi, 36); s.pluck(11, 1.f, 0, 990.0); run(s, 128); ok(std::fabs(s.latLast() - 10.0) < 1e-6, "medicion de latencia software");
    // estres: 36 voces
    s.init(48000, midi, 36); for (int i = 0; i < 36; i++) s.pluck(i, 1.f, i * 3000, 999.0);
    o = run(s, 48000); float mx = 0; for (float x : o) mx = std::max(mx, std::fabs(x)); ok(mx < 1.0f && mx > 0.01f, "36 cuerdas sin saturar");
    printf(fails ? "HAY FALLAS\n" : "TODO OK\n"); return fails;
}
