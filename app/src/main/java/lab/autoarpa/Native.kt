package lab.autoarpa

/** Puente al nucleo nativo (C++ / Oboe). Todas las llamadas son baratas y no bloquean. */
object Native {
    init { System.loadLibrary("autoarpa") }
    external fun setTuning(midi: IntArray)
    external fun start(): Boolean
    external fun stop()
    /** tMs: hora del toque en CLOCK_MONOTONIC (ms). offsetUs: retraso relativo dentro de un mismo rasgueo. */
    external fun pluck(idx: Int, vel: Float, offsetUs: Int, tMs: Double)
    external fun damp(idx: Int, offsetUs: Int)
    external fun setMask(open: Long)
    external fun getLevels(dst: FloatArray)
    external fun stats(dst: DoubleArray)
    external fun resetStats()
    external fun nowMs(): Double
}
