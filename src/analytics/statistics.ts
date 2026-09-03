/**
 * Статистикийн цэвэр функцүүд.
 *
 * ⚠️ POPULATION standard deviation (Excel-ийн STDEV.P) ашиглана — SAMPLE (STDEV.S) БИШ.
 *    Учир нь lookback сарууд бол түүврийн хэсэг биш, тухайн шинжилж буй
 *    ХУГАЦААНЫ БҮХ ажиглалт мөн.
 *
 *      STDEV.P = sqrt( Σ(xᵢ − μ)² / n )      ← ашиглаж буй
 *      STDEV.S = sqrt( Σ(xᵢ − μ)² / (n−1) )  ← ашиглахгүй
 */

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/** Арифметик дундаж. Хоосон массивт 0 буцаана. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

/**
 * Population standard deviation (STDEV.P).
 * Хоосон массивт 0 буцаана. Нэг элементтэй үед үргэлж 0.
 */
export function populationStdDev(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;

  const mu = mean(values);
  let squaredDiff = 0;
  for (const value of values) {
    const diff = value - mu;
    squaredDiff += diff * diff;
  }
  // Хөвөгч таслалын хуримтлагдсан алдаанаас болж маш бага сөрөг гарахаас сэргийлнэ
  return Math.sqrt(Math.max(0, squaredDiff / n));
}

/**
 * Хэлбэлзлийн коэффициент = stdDev / |mean|.
 *
 * Дундаж яг 0 бол `null` буцаана (0-д хуваахгүй) — дуудагч тал үүнийг
 * "хөдөлгөөнгүй" гэж тайлбарлана.
 *
 * Дундаж СӨРӨГ байх нь онолын хувьд боломжтой (буцаалт борлуулалтаас давсан).
 * Тэр үед |mean| ашиглан CV эерэг хэвээр байлгана.
 */
export function coefficientOfVariation(values: readonly number[]): number | null {
  const mu = mean(values);
  if (mu === 0) return null;
  return populationStdDev(values) / Math.abs(mu);
}

/** Хөвөгч таслалын үлдэгдэл чимээг цэвэрлэж, тогтвортой дугуйлалт хийнэ */
export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
