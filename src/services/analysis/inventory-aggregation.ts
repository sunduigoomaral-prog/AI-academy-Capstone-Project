/**
 * Байрлал түвшний нэгтгэл — DB давхарга.
 *
 * ⚠️ ГҮЙЦЭТГЭЛ: нэгтгэл PostgreSQL дээр `groupBy`-аар хийгдэнэ. Түүхий
 *    гүйлгээний мөрүүд Node эсвэл браузер руу татагдахгүй.
 *
 * Grain: (product, location)
 *   averageMonthlySales = тухайн БАЙРШЛЫН lookback нийлбэр / бүтэн сарын тоо
 *   currentStock        = calculation month дахь тухайн байршлын үлдэгдэл
 *   abc / xyz           = SKU ТҮВШНИЙ ангилал (AbcXyzResult), байршлаас хамаарахгүй
 */

import { prisma } from '../../lib/prisma';
import type {
  AbcClass,
  AbcXyzClass,
  InventoryPosition,
  LocationType,
  PeriodKey,
  SalesScope,
  XyzClass,
} from '../../types/domain';

export interface PositionQuery {
  runId: string;
  periods: PeriodKey[];
  stockPeriod: PeriodKey;
  scope: SalesScope;
}

export interface PositionResult {
  positions: InventoryPosition[];
  productIdByCode: Map<string, string>;
  locationIdByCode: Map<string, string>;
  /** ABC-XYZ ангилалгүй тул алгасагдсан байрлалын тоо */
  skippedUnclassified: number;
}

function locationTypeFilter(scope: SalesScope) {
  if (scope === 'ALL') return {};
  return { location: { type: scope as LocationType } };
}

export async function buildPositions(query: PositionQuery): Promise<PositionResult> {
  const { runId, periods, stockPeriod, scope } = query;

  if (periods.length === 0) {
    throw new Error('Нэгтгэх сар байхгүй байна — lookback хоосон.');
  }

  const [salesRows, stockRows, classes] = await Promise.all([
    prisma.salesFact.groupBy({
      by: ['productId', 'locationId'],
      where: { periodKey: { in: periods }, ...locationTypeFilter(scope) },
      _sum: { quantity: true },
    }),
    prisma.stockSnapshot.groupBy({
      by: ['productId', 'locationId'],
      where: { periodKey: stockPeriod, ...locationTypeFilter(scope) },
      _sum: { quantityOnHand: true, stockValue: true },
    }),
    prisma.abcXyzResult.findMany({
      where: { runId },
      select: {
        productId: true,
        productCode: true,
        productName: true,
        abcClass: true,
        xyzClass: true,
        abcXyz: true,
      },
    }),
  ]);

  if (classes.length === 0) {
    throw new Error(
      `Гүйлт ${runId}-д ABC-XYZ үр дүн олдсонгүй. Эхлээд ABC-XYZ тооцоолол хийнэ үү.`,
    );
  }

  const classByProductId = new Map(classes.map((c) => [c.productId, c]));

  // Байрлалын universe: борлуулалттай ∪ үлдэгдэлтэй
  const keyOf = (productId: string, locationId: string) => `${productId}|${locationId}`;
  const salesByKey = new Map(
    salesRows.map((r) => [keyOf(r.productId, r.locationId), Number(r._sum.quantity ?? 0)]),
  );
  const stockByKey = new Map(
    stockRows.map((r) => [
      keyOf(r.productId, r.locationId),
      {
        quantity: Number(r._sum.quantityOnHand ?? 0),
        value: Number(r._sum.stockValue ?? 0),
      },
    ]),
  );

  const universe = new Map<string, { productId: string; locationId: string }>();
  for (const row of salesRows) {
    universe.set(keyOf(row.productId, row.locationId), {
      productId: row.productId,
      locationId: row.locationId,
    });
  }
  for (const row of stockRows) {
    universe.set(keyOf(row.productId, row.locationId), {
      productId: row.productId,
      locationId: row.locationId,
    });
  }

  const locationIds = new Set(Array.from(universe.values()).map((u) => u.locationId));
  const locations = await prisma.location.findMany({
    where: { id: { in: Array.from(locationIds) } },
    select: {
      id: true,
      code: true,
      type: true,
      company: { select: { code: true } },
      channel: { select: { code: true } },
    },
  });
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const productIdByCode = new Map<string, string>();
  const locationIdByCode = new Map<string, string>();
  for (const location of locations) locationIdByCode.set(location.code, location.id);

  const months = periods.length;
  const positions: InventoryPosition[] = [];
  let skippedUnclassified = 0;

  for (const { productId, locationId } of universe.values()) {
    const classification = classByProductId.get(productId);
    const location = locationById.get(locationId);

    // ABC-XYZ ангилалгүй бол ЧИМЭЭГҮЙ оруулахгүй — тоолж тайлагнана
    if (!classification || !location) {
      skippedUnclassified += 1;
      continue;
    }

    productIdByCode.set(classification.productCode, productId);

    const key = keyOf(productId, locationId);
    const stock = stockByKey.get(key);
    const currentStock = stock?.quantity ?? 0;
    const currentStockValue = stock?.value ?? 0;

    positions.push({
      productCode: classification.productCode,
      productName: classification.productName,
      locationCode: location.code,
      locationType: location.type as LocationType,
      // ⚠️ Эх өгөгдөлд сувгийн хэмжээст байхгүй — ихэвчлэн null
      channelCode: location.channel?.code ?? null,
      companyCode: location.company?.code ?? null,
      abc: classification.abcClass as AbcClass,
      xyz: classification.xyzClass as XyzClass,
      abcXyz: classification.abcXyz as AbcXyzClass,
      averageMonthlySales: (salesByKey.get(key) ?? 0) / months,
      currentStock,
      currentStockValue,
      unitCost: currentStock !== 0 ? currentStockValue / currentStock : null,
    });
  }

  return { positions, productIdByCode, locationIdByCode, skippedUnclassified };
}
