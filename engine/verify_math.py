"""Independent re-computation of every physics claim the engine makes (no LLM, plain Python).
`python engine/verify_math.py` must print ALL OK. These are the numbers behind the `evidence` strings."""
from math import sqrt, log, pi, cos, tan, atan, isclose

def ok(name, got, want, tol=1e-2):
    good = isclose(got, want, rel_tol=tol)
    print(("OK   " if good else "FAIL ") + f"{name}: got {got:.6g}, expected {want:.6g}")
    return good

r = []
# Q31 LCR: supply voltage
r.append(ok("Q31 supply V (key was 130)", sqrt(40**2 + (60 - 30)**2), 50))
# Q15 pressure
r.append(ok("Q15 P=rho v^2/3 (key was 4556)", 9e-2 * 400**2 / 3, 4800))
# Q1 flux: face-centre q/2 -> 1/2 ; corner 2q -> 1/8 ; in units of q/e0
flux = 0.5 * (1 / 2) + (1 / 8) * 2
r.append(ok("Q1 flux in q/e0 (n = flux*2, key was 2)", flux * 2, 1))
# Q30 mean life
r.append(ok("Q30 tau min", 3 / log(48 / 6), 1.443))
# Q35 cube side
r.append(ok("Q35 side cm: 800 = 2*a^2", sqrt(800 / 2), 20))
# Q22 KE of electron with lambda=0.3 nm
h, m, e = 6.63e-34, 9.1e-31, 1.6e-19
r.append(ok("Q22 KE eV", h**2 / (2 * m * (0.3e-9)**2) / e, 16.8, 0.01))
# Q6 volume contraction with 10 cm edge
r.append(ok("Q6 dV mm^3", 7e6 * 0.1**3 / 1.4e11 * 1e9, 50))
# Q23 impedance with L = 95.5 mH
XL = 2 * pi * 50 * 95.5e-3
r.append(ok("Q23 Z ohm", sqrt(40**2 + XL**2), 50))
# Q37 7/8 disintegrated -> 3 half lives
r.append(ok("Q37 days", 60 * log(8, 2), 180))
# Q28 friction
r.append(ok("Q28 friction N (= weight, < 30)", 2 * 10, 20))
# Q2 sig figs: 6*7.203^2 = 311.299 -> 311.3 -> 10A = 3113
r.append(ok("Q2 10A", round(6 * 7.203**2, 1) * 10, 3113))
# Q8 dots realign
t = sqrt(2 * 2 * pi / (0.5 * (pi / 2 - pi / 4) * 2))  # solve 0.5*(a1-a2)*t^2 = 2pi
r.append(ok("Q8 t s", sqrt(2 * 2 * pi / (pi / 2 - pi / 4)), 4))
# Q16 friction coefficient (mu) from F-100mu=10, 2F-100mu=100
mu = (100 - 20) / 100
r.append(ok("Q16 mu", mu, 0.8))
# Q33 potentials
V = 16; VP = 11 * V / 8; VS = V / 2
r.append(ok("Q33 VP-VS", VP - VS, 14))
# Q34 surface density ratio
r.append(ok("Q34 sigma ratio", (64 / 16), 4))
# Q39 SHM amplitude
w = 2 * pi / 16
r.append(ok("Q39 A (8 sqrt2)", pi / (w * cos(pi / 4)), 8 * sqrt(2)))
# Q40 projectile: H/R = tan(theta)/4 = 1
th = atan(4); from math import sin
r.append(ok("Q40 H/R at tan theta=4", (sin(th)**2 / 2) / (2 * sin(th) * cos(th)), 1))
# Q41 YDSE shift in cm
r.append(ok("Q41 shift cm", (1 / 5e-3) * (2e-3 * 0.5 - 1.5e-3 * 0.4) * 100, 8))
# Q27 gamma
r.append(ok("Q27 gamma e-5", 3 * 0.19 / 100 / 100 * 1e5, 5.7))
# Q32 KE eV
r.append(ok("Q32 KE eV", (6.6e-34)**2 / (2 * 9.1e-31 * (6.6e-34 * 3e8 / (1.6e-19 * 24800))**2) / 1.6e-19, 600, 0.03))
# Q18 two equal waves, phase pi/2: I/I0 = 4 cos^2(pi/4) = 2 (so 'equal to one wave' is false)
r.append(ok("Q18 I/I0 at phi=pi/2", 4 * cos(pi / 4)**2, 2))
# Q36 CM velocity
r.append(ok("Q36 vcm", (10 * 14) / 14, 10))
# Q7 displacement current uA
r.append(ok("Q7 I_d uA", 10 * 8.85e-12 * 1 / 1e-3 * 25 * 1e6, 2.2, 0.02))
# Q0, Q4
r.append(ok("Q0 force N", 100 * 1.1 * 0.9, 99))
r.append(ok("Q4 V0", 12400 / 4000 - 2.0, 1.1))
print("\nALL OK" if all(r) else "\nSOME CHECKS FAILED")
raise SystemExit(0 if all(r) else 1)
