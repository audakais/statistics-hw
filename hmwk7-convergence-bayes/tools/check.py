# python tools/check.py  ->  independent values for the special functions used by the page (standard library only)
# Integer parameters: I_x(a, b) = P(Binomial(a + b - 1, x) >= a), summed exactly with fractions.
# Other parameters: composite Simpson rule on the Beta density, normalised with math.lgamma.
import math
from fractions import Fraction

def beta_cdf_int(x, a, b):
    x = Fraction(x).limit_denominator(10**6); m = a + b - 1
    return float(sum(math.comb(m, j) * x**j * (1 - x)**(m - j) for j in range(a, m + 1)))

def beta_cdf_simpson(x, a, b, n=200000):
    c = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    # substitution t = u^2 removes the endpoint singularity of t^(a-1) when a < 1
    def f(u):
        if u == 0:
            return 2 * math.exp(c) if a == 0.5 else 0.0
        return 2 * math.exp(c + (2 * a - 1) * math.log(u) + (b - 1) * math.log1p(-u * u))
    h = math.sqrt(x) / n
    s = f(0) + f(math.sqrt(x)) + sum((4 if i % 2 else 2) * f(i * h) for i in range(1, n))
    return s * h / 3

for x, a, b in [(0.3, 2, 5), (0.7, 18, 9), (0.9, 120, 30), (0.62, 37, 28)]:
    print("betaCdf", x, a, b, "%.15g" % beta_cdf_int(x, a, b))
for x, a, b in [(0.5, 0.5, 0.5), (0.05, 17.5, 8.5)]:
    print("betaCdf", x, a, b, "%.15g" % beta_cdf_simpson(x, a, b))
for x in [0.5, 1, 1.5, 3.7, 10.25, 50.5]:
    print("lnGamma", x, "%.15g" % math.lgamma(x))

# exact coverage of the Wald interval, n = 20, p = 0.1
z = 1.959963984540054; n = 20; p = 0.1; cov = 0
for k in range(n + 1):
    ph = k / n; h = z * math.sqrt(ph * (1 - ph) / n)
    if ph - h <= p <= ph + h:
        cov += math.comb(n, k) * p**k * (1 - p)**(n - k)
print("Wald coverage n=20 p=0.1", round(cov, 4))
