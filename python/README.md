# python — Excel ingest ба inspection

## Файлууд
- `inspect_excel.py` — Excel-ийн бүтэц шалгах, давтан ажиллуулж болно
- `mapping/column_map.py` — Excel багана → нормчилсон нэр (`src/config/source-mapping.ts`-ийн толин тусгал)
- `ingest/` — Phase 2: extract → validate → load

## Ажиллуулах

```
set PYTHONIOENCODING=utf-8
python python/inspect_excel.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx"
```

## Шаардлага

```
pip install pandas numpy openpyxl psycopg2-binary python-dotenv
```

## ⚠️ Анхаарах

Product code (`Дотоод код`) нь Excel-д **текстээр**, тэргүүлэх 0-той хадгалагдсан.
pandas-аар уншихдаа заавал `dtype={"Дотоод код": str}` гэж заана.
Эс тэгвэл `0100139` нь `100139` болж business key эвдэрнэ.
