// exp and log of our own (fdlibm's e_exp.c and e_log.c, what V8 has behind Math.exp and Math.log): the bot weighs its
// steps with them, and the system's exp and log differ in the last bit from one libm to another, which is enough for
// another step to win a near tie. With these the bot plays the same on every machine, and the same as the JS bot it
// was ported from (test/bot.mjs, in the history of the repo) played when the levels were tuned.
fn hi(x: f64) -> u32 { (x.to_bits() >> 32) as u32 }
fn with_hi(x: f64, h: u32) -> f64 { f64::from_bits((x.to_bits() & 0xffff_ffff) | ((h as u64) << 32)) }

pub fn exp(mut x: f64) -> f64 {
    const HALF: [f64; 2] = [0.5, -0.5];
    const LN2HI: [f64; 2] = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
    const LN2LO: [f64; 2] = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
    const INVLN2: f64 = 1.44269504088896338700e+00;
    const P1: f64 = 1.66666666666666019037e-01; const P2: f64 = -2.77777777770155933842e-03; const P3: f64 = 6.61375632143793436117e-05;
    const P4: f64 = -1.65339022054652515390e-06; const P5: f64 = 4.13813679705723846039e-08;
    const TWOM1000: f64 = 9.33263618503218878990e-302;
    let mut hx = hi(x); let xsb = ((hx >> 31) & 1) as usize; hx &= 0x7fffffff;
    if hx >= 0x40862E42 {
        if hx >= 0x7ff00000 { if x.is_nan() { return x; } return if xsb == 0 { x } else { 0.0 }; }
        if x > 7.09782712893383973096e+02 { return f64::INFINITY; }
        if x < -7.45133219101941108420e+02 { return 0.0; }
    }
    let (mut h, mut l, k): (f64, f64, i32) = (0.0, 0.0, 0);
    let k = if hx > 0x3fd62e42 {
        let k = if hx < 0x3FF0A2B2 { h = x - LN2HI[xsb]; l = LN2LO[xsb]; 1 - 2 * xsb as i32 }
        else { let k = (INVLN2 * x + HALF[xsb]) as i32; let t = k as f64; h = x - t * LN2HI[0]; l = t * LN2LO[0]; k };
        x = h - l; k
    } else if hx < 0x3e300000 { return 1.0 + x; } else { k };
    let t = x * x;
    let c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    if k == 0 { return 1.0 - ((x * c) / (c - 2.0) - x); }
    let y = 1.0 - ((l - (x * c) / (2.0 - c)) - h);
    if k >= -1021 { with_hi(y, hi(y).wrapping_add((k as u32) << 20)) }
    else { with_hi(y, hi(y).wrapping_add(((k + 1000) as u32) << 20)) * TWOM1000 }
}

pub fn log(mut x: f64) -> f64 {
    const LN2_HI: f64 = 6.93147180369123816490e-01; const LN2_LO: f64 = 1.90821492927058770002e-10; const TWO54: f64 = 1.80143985094819840000e+16;
    const LG1: f64 = 6.666666666666735130e-01; const LG2: f64 = 3.999999999940941908e-01; const LG3: f64 = 2.857142874366239149e-01;
    const LG4: f64 = 2.222219843214978396e-01; const LG5: f64 = 1.818357216161805012e-01; const LG6: f64 = 1.531383769920937332e-01; const LG7: f64 = 1.479819860511658591e-01;
    let mut hx = hi(x) as i32; let lx = x.to_bits() as u32; let mut k: i32 = 0;
    if hx < 0x00100000 {
        if ((hx & 0x7fffffff) as u32 | lx) == 0 { return f64::NEG_INFINITY; }
        if hx < 0 { return f64::NAN; }
        k -= 54; x *= TWO54; hx = hi(x) as i32;
    }
    if hx >= 0x7ff00000 { return x + x; }
    k += (hx >> 20) - 1023; hx &= 0x000fffff;
    let i = (hx + 0x95f64) & 0x100000;
    x = with_hi(x, (hx | (i ^ 0x3ff00000)) as u32); k += i >> 20;
    let f = x - 1.0;
    if (0x000fffff & (2 + hx)) < 3 {
        if f == 0.0 { if k == 0 { return 0.0; } let dk = k as f64; return dk * LN2_HI + dk * LN2_LO; }
        let r = f * f * (0.5 - 0.33333333333333333 * f);
        if k == 0 { return f - r; }
        let dk = k as f64; return dk * LN2_HI - ((r - dk * LN2_LO) - f);
    }
    let s = f / (2.0 + f); let dk = k as f64; let z = s * s; let mut i = hx - 0x6147a; let w = z * z; let j = 0x6b851 - hx;
    let t1 = w * (LG2 + w * (LG4 + w * LG6)); let t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    i |= j; let r = t2 + t1;
    if i > 0 {
        let hfsq = 0.5 * f * f;
        if k == 0 { f - (hfsq - s * (hfsq + r)) } else { dk * LN2_HI - ((hfsq - (s * (hfsq + r) + dk * LN2_LO)) - f) }
    } else if k == 0 { f - s * (f - r) } else { dk * LN2_HI - ((s * (f - r) - dk * LN2_LO) - f) }
}
