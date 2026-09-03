# services — Orchestration

DB-ээс өгөгдөл татах → config унших → `analytics/` дуудах → үр дүн бичих.

## Дүрэм
- ✅ Prisma энд ашиглана
- ✅ `config-service.ts`-ээс тохиргоо уншина
- ❌ Математик тооцоолол ЭНД БИЧИХГҮЙ (`analytics/` руу)
- ❌ JSX байхгүй

## Төлөвлөсөн (Phase 4)
- `analysis-run.service.ts` — нэг гүйлт: lookback татах, ангилах, үр дүн хадгалах
- `import.service.ts` — ImportBatch удирдах
- `product.service.ts`, `recommendation.service.ts`
