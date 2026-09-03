# analytics — ЦЭВЭР ТООЦООЛОЛ

Энэ давхарга нь **цэвэр функцүүд** (pure functions) л агуулна.

## Дүрэм
- ❌ Prisma / DB / fetch / React import **хийхгүй**
- ❌ Тохиргоог өөрөө уншихгүй — параметрээр **дамжуулж авна**
- ❌ Threshold, target days hardcode **хийхгүй**
- ✅ Оролт → гаралт бүрэн урьдчилан таамаглагдах, unit-тест хийгддэг

## Төлөвлөсөн модулиуд (Phase 3)

| Файл | Үүрэг |
|---|---|
| `abc/abc-classifier.ts` | Хуримтлагдсан хувиар A/B/C ангилах |
| `xyz/xyz-classifier.ts` | CV = stdDev / avg → X/Y/Z |
| `inventory/stock-balance.ts` | daysOfSupply, targetQty, balanceQty |
| `inventory/days-of-supply.ts` | Өдрийн дундаж эрэлт |
| `risk/dead-stock.ts` | Үлдэгдэлтэй, борлуулалтгүй |
| `risk/stockout.ts` | Дутагдлын эрсдэл |
| `risk/excess.ts` | Илүүдэл нөөц |
| `pricing/purchase-price-control.ts` | Нэгж үнийн хазайлт |
| `recommendation/transfer.ts` | Байршил хоорондын шилжүүлэг |
| `recommendation/purchase.ts` | Худалдан авалтын санал |
| `recommendation/rule-engine.ts` | Дүрмүүдийг нэгтгэж AIRecommendation гаргах |
