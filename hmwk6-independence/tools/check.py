# python tools/check.py  ->  independent recomputation (standard library only)
# Counts are read again from the CSV, the statistic is recomputed, and the tail probability
# is obtained with a different algorithm: the regularized upper incomplete gamma Q(k/2, x/2),
# series below a + 1 and Lentz continued fraction above, with math.lgamma.
import csv, math, os

def gammq(a, x):
    if x <= 0:
        return 1.0
    if x < a + 1:
        ap, s, d = a, 1.0 / a, 1.0 / a
        for _ in range(10000):
            ap += 1; d *= x / ap; s += d
            if abs(d) < abs(s) * 1e-17:
                break
        return 1.0 - s * math.exp(-x + a * math.log(x) - math.lgamma(a))
    tiny = 1e-300
    b = x + 1 - a; c = 1 / tiny; d = 1 / b; h = d
    for i in range(1, 10000):
        an = -i * (i - a); b += 2
        d = an * d + b; d = tiny if abs(d) < tiny else d
        c = b + an / c; c = tiny if abs(c) < tiny else c
        d = 1 / d; delta = d * c; h *= delta
        if abs(delta - 1) < 1e-16:
            break
    return math.exp(-x + a * math.log(x) - math.lgamma(a)) * h

def chi2(table):
    r = [sum(row) for row in table]; c = [sum(col) for col in zip(*table)]; n = sum(r)
    return sum((table[i][j] - r[i] * c[j] / n) ** 2 / (r[i] * c[j] / n) for i in range(len(r)) for j in range(len(c)))

rows = list(csv.DictReader(open(os.path.join(os.path.dirname(__file__), "..", "ucb-admissions.csv"))))
def tab(x, y, keep=lambda r: True):
    xs = sorted({r[x] for r in rows}); ys = sorted({r[y] for r in rows})
    t = [[0] * len(ys) for _ in xs]
    for r in rows:
        if keep(r):
            t[xs.index(r[x])][ys.index(r[y])] += int(r["Freq"])
    return t

for name, t in [("Gender x Admit", tab("Gender", "Admit")), ("Dept x Admit", tab("Dept", "Admit")), ("Gender x Dept", tab("Gender", "Dept"))]:
    s = chi2(t); df = (len(t) - 1) * (len(t[0]) - 1)
    print(name, "chi2 %.10f df %d p %.15g" % (s, df, gammq(df / 2, s / 2)))
tot = 0
for d in "ABCDEF":
    s = chi2(tab("Gender", "Admit", lambda r: r["Dept"] == d)); tot += s
    print("Dept", d, "chi2 %.10f p %.15g" % (s, gammq(0.5, s / 2)))
print("sum %.10f p %.15g" % (tot, gammq(3, tot / 2)))
for x, k in [(3.841458820694124, 1), (5.991464547107979, 2), (11.0705, 5), (92.2, 1), (21.7, 6), (1.0, 3), (50, 7), (800, 25), (2.5, 4)]:
    print("sf", x, k, "%.15g" % gammq(k / 2, x / 2))
