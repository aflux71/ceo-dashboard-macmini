import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const DEFAULT_CATEGORIES = [
  "Bath Bombs", "Body Wash", "Scrubs", "Lotions",
  "Oils", "Soaps", "Shampoo Bars", "Candles", "Other"
];

const SETTING_KEY = "product_categories";

export function useProductCategories() {
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const settings = await base44.entities.AppSettings.filter({ key: SETTING_KEY });
      if (settings.length > 0) {
        return JSON.parse(settings[0].value || "[]");
      }
      return DEFAULT_CATEGORIES;
    },
    staleTime: 60000,
  });

  const saveMutation = useMutation({
    mutationFn: async (newCategories) => {
      const settings = await base44.entities.AppSettings.filter({ key: SETTING_KEY });
      const payload = {
        key: SETTING_KEY,
        value: JSON.stringify(newCategories),
        description: "Product categories for recipes",
      };
      if (settings.length > 0) {
        await base44.entities.AppSettings.update(settings[0].id, payload);
      } else {
        await base44.entities.AppSettings.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-categories"] });
    },
  });

  return {
    categories: categories || DEFAULT_CATEGORIES,
    isLoading,
    saveCategories: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}

export const DEFAULT_CATEGORY_PREFIXES = {
  "Bath Bombs": "BB",
  "Body Wash": "BW",
  "Scrubs": "SC",
  "Lotions": "LO",
  "Oils": "OI",
  "Soaps": "SP",
  "Shampoo Bars": "SB",
  "Candles": "CA",
  "Other": "OT",
};