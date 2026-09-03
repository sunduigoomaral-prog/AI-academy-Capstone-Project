'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * §3, §4 — DASHBOARD ДАЯАРХ ШҮҮЛТҮҮР.
 *
 * Нэг л context — сонгосон бүтээгдэхүүн / байршил бүх хэсэгт (KPI, Sales,
 * Stock, ABCXYZ, Risk, Purchase, Transfer, Price, AI) нэгэн зэрэг үйлчилнэ.
 *
 * ⚠️ §29: шүүлтүүр нь query string болж SERVER рүү явна. Client талд
 *    бүх мөрийг татаад шүүхгүй.
 */

export interface ProductOption {
  productCode: string;
  name: string | null;
  manufacturerName?: string | null;
}

export interface FilterState {
  productCodes: string[];
  /** ХХК (Excel `ХХК`) — эхний шатны сонголт */
  companyCodes: string[];
  locationType: string | null;
  /** Суваг / байршил (Excel `Суваг`) */
  locationCodes: string[];
  channelCodes: string[];
}

interface FilterContextValue extends FilterState {
  selectedProducts: ProductOption[];
  setSelectedProducts: (products: ProductOption[]) => void;
  toggleProduct: (product: ProductOption) => void;
  clearProducts: () => void;
  setCompanyCodes: (codes: string[]) => void;
  setLocationType: (value: string | null) => void;
  setLocationCodes: (codes: string[]) => void;
  setChannelCodes: (codes: string[]) => void;
  reset: () => void;
  /** API дуудлагад шууд залгах query string */
  queryString: string;
  isFiltered: boolean;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([]);
  const [companyCodes, setCompanyCodesState] = useState<string[]>([]);
  const [locationType, setLocationType] = useState<string | null>(null);
  const [locationCodes, setLocationCodes] = useState<string[]>([]);
  const [channelCodes, setChannelCodes] = useState<string[]>([]);

  /**
   * ХХК солиход түүнд хамаарахгүй болсон байршлын сонголтыг цэвэрлэнэ
   * (шатлал: ХХК → байршлын төрөл → суваг/байршил).
   */
  const setCompanyCodes = useCallback((codes: string[]) => {
    setCompanyCodesState(codes);
    setLocationCodes([]);
  }, []);

  const productCodes = useMemo(
    () => selectedProducts.map((p) => p.productCode),
    [selectedProducts],
  );

  const toggleProduct = useCallback((product: ProductOption) => {
    setSelectedProducts((current) =>
      current.some((p) => p.productCode === product.productCode)
        ? current.filter((p) => p.productCode !== product.productCode)
        : [...current, product],
    );
  }, []);

  const reset = useCallback(() => {
    setSelectedProducts([]);
    setCompanyCodesState([]);
    setLocationType(null);
    setLocationCodes([]);
    setChannelCodes([]);
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (productCodes.length) params.set('productCodes', productCodes.join(','));
    if (companyCodes.length) params.set('companyCodes', companyCodes.join(','));
    if (locationType) params.set('locationType', locationType);
    if (locationCodes.length) params.set('locationCodes', locationCodes.join(','));
    if (channelCodes.length) params.set('channelCodes', channelCodes.join(','));
    return params.toString();
  }, [productCodes, companyCodes, locationType, locationCodes, channelCodes]);

  const value: FilterContextValue = {
    productCodes,
    companyCodes,
    locationType,
    locationCodes,
    channelCodes,
    selectedProducts,
    setSelectedProducts,
    toggleProduct,
    clearProducts: () => setSelectedProducts([]),
    setCompanyCodes,
    setLocationType,
    setLocationCodes,
    setChannelCodes,
    reset,
    queryString,
    isFiltered:
      productCodes.length > 0 ||
      companyCodes.length > 0 ||
      locationType !== null ||
      locationCodes.length > 0 ||
      channelCodes.length > 0,
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useDashboardFilter(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useDashboardFilter нь DashboardFilterProvider дотор дуудагдах ёстой.');
  }
  return context;
}

/**
 * §3 — server-side бүтээгдэхүүний хайлт, DEBOUNCE-тэй.
 * Том өгөгдөлд бүх бүтээгдэхүүнийг татахгүй — зөвхөн таарсан хэсгийг.
 */
export function useProductSearch(query: string, debounceMs = 300) {
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, take: '25' });
        const res = await fetch(`/api/products/search?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        setOptions(payload.rows as ProductOption[]);
        setTotal(payload.total as number);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, debounceMs]);

  return { options, total, loading };
}
