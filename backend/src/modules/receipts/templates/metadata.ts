import { PdfOptions } from "../services/playwright-pdf-generator.service";

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: "business" | "creative" | "minimal" | "premium";
  features: string[];
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  preview: string;
  pdfOptions?: Partial<PdfOptions>;
}

export const TEMPLATE_METADATA: Record<string, TemplateMetadata> = {
  classic: {
    id: "classic",
    name: "Classic",
    description:
      "Строгий деловой инвойс с четкой структурой и профессиональным видом",
    category: "business",
    features: [
      "Деловой стиль",
      "Четкая структура",
      "Профессиональный вид",
      "Подходит для печати",
    ],
    colors: {
      primary: "#1E3A8A",
      secondary: "#6B7280",
      accent: "#E5E7EB",
    },
    preview: "/templates/previews/classic.png",
  },

  modern: {
    id: "modern",
    name: "Modern",
    description: "Современный минималистичный дизайн с акцентными элементами",
    category: "creative",
    features: [
      "Современный дизайн",
      "Акцентные полосы",
      "Карточки метаданных",
      "QR код оплаты",
    ],
    colors: {
      primary: "#2563EB",
      secondary: "#6B7280",
      accent: "#F3F4F6",
    },
    preview: "/templates/previews/modern.png",
  },

  elegant: {
    id: "elegant",
    name: "Elegant",
    description:
      "Премиальный стиль с тонкой типографикой и элегантными элементами",
    category: "premium",
    features: [
      "Премиальный стиль",
      "Тонкая типографика",
      "Скриптовая подпись",
      "Монохромный дизайн",
    ],
    colors: {
      primary: "#111827",
      secondary: "#6B7280",
      accent: "#94A3B8",
    },
    preview: "/templates/previews/elegant.png",
  },

  vintage: {
    id: "vintage",
    name: "Vintage",
    description:
      "Винтажный стиль с эффектом старой бумаги и декоративными элементами",
    category: "creative",
    features: [
      "Винтажный стиль",
      "Текстурный фон",
      "Декоративные элементы",
      "Сепия цвета",
    ],
    colors: {
      primary: "#6B4F35",
      secondary: "#8C6B4A",
      accent: "#D6B98C",
    },
    preview: "/templates/previews/vintage.png",
  },

  tech: {
    id: "tech",
    name: "Tech (Geo)",
    description:
      "Геометричный хай-тек дизайн с круговыми элементами и инфо-метками",
    category: "creative",
    features: [
      "Геометричный дизайн",
      "Круговые элементы",
      "Инфо-метки",
      "Хай-тек стиль",
    ],
    colors: {
      primary: "#EF4444",
      secondary: "#2563EB",
      accent: "#F3F4F6",
    },
    preview: "/templates/previews/tech.png",
  },

  wave: {
    id: "wave",
    name: "Wave",
    description: "Мягкий дизайн с волновой графикой и дружественным видом",
    category: "creative",
    features: [
      "Волновая графика",
      "Мягкий дизайн",
      "Дружественный вид",
      "Анимированные элементы",
    ],
    colors: {
      primary: "#3B82F6",
      secondary: "#6B7280",
      accent: "#E5E7EB",
    },
    preview: "/templates/previews/wave.png",
  },

  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Максимально нейтральный дизайн для любых печатей и архивов",
    category: "minimal",
    features: [
      "Минимализм",
      "Нейтральный дизайн",
      "Ч/б стиль",
      "Подходит для архивов",
    ],
    colors: {
      primary: "#111827",
      secondary: "#4B5563",
      accent: "#D1D5DB",
    },
    preview: "/templates/previews/minimal.png",
  },

  standard: {
    id: "standard",
    name: "Standard",
    description: "Стандартный шаблон чека с базовой функциональностью",
    category: "business",
    features: [
      "Базовая функциональность",
      "Стандартный дизайн",
      "Простота использования",
    ],
    colors: {
      primary: "#4A90E2",
      secondary: "#6B7280",
      accent: "#E5E7EB",
    },
    preview: "/templates/previews/standard.png",
  },

  compact: {
    id: "compact",
    name: "Compact",
    description: "Компактный шаблон для экономии места и бумаги",
    category: "minimal",
    features: ["Компактный дизайн", "Экономия места", "Малый размер шрифта"],
    colors: {
      primary: "#4A90E2",
      secondary: "#6B7280",
      accent: "#E5E7EB",
    },
    preview: "/templates/previews/compact.png",
  },

  corporate: {
    id: "corporate",
    name: "Corporate Invoice",
    description:
      "Строгий корпоративный инвойс в деловом стиле с четкой структурой",
    category: "business",
    features: [
      "Корпоративный стиль",
      "Строгая структура",
      "Монохромный дизайн",
      "Профессиональный вид",
    ],
    colors: {
      primary: "#000000",
      secondary: "#4B5563",
      accent: "#D1D5DB",
    },
    preview: "/templates/previews/corporate.png",
  },

  thermal: {
    id: "thermal",
    name: "Thermal",
    description: "Узкий формат 80мм для кассовых аппаратов и термопринтеров",
    category: "minimal",
    features: [
      "80мм формат",
      "Моноширинный шрифт",
      "Компактный дизайн",
      "Для термопринтера",
    ],
    colors: {
      primary: "#000000",
      secondary: "#333333",
      accent: "#666666",
    },
    preview: "/templates/previews/thermal.png",
    pdfOptions: {
      width: "80mm",
      preferCSSPageSize: true,
      margin: { top: "3mm", bottom: "3mm", left: "2mm", right: "2mm" },
    },
  },

  dark: {
    id: "dark",
    name: "Dark",
    description:
      "Тёмная тема с тёмно-синим фоном и голубыми акцентами для стильных документов",
    category: "creative",
    features: [
      "Тёмная тема",
      "Голубые акценты",
      "Современный стиль",
      "Контрастный дизайн",
    ],
    colors: {
      primary: "#4FC3F7",
      secondary: "#1a1a2e",
      accent: "#16213e",
    },
    preview: "/templates/previews/dark.png",
  },

  branded: {
    id: "branded",
    name: "Branded",
    description:
      "Брендированный шаблон с настраиваемым фирменным цветом компании",
    category: "premium",
    features: [
      "Фирменный цвет",
      "Профессиональный стиль",
      "Настраиваемый акцент",
      "Премиальный вид",
    ],
    colors: {
      primary: "#3B82F6",
      secondary: "#6B7280",
      accent: "#EFF6FF",
    },
    preview: "/templates/previews/branded.png",
  },

  delivery: {
    id: "delivery",
    name: "Delivery Note",
    description: "Накладная без цен — только товары и количество для доставки",
    category: "business",
    features: [
      "Без цен",
      "Только количество",
      "Подпись получателя",
      "Зелёный акцент",
    ],
    colors: {
      primary: "#059669",
      secondary: "#6B7280",
      accent: "#ECFDF5",
    },
    preview: "/templates/previews/delivery.png",
  },

  proforma: {
    id: "proforma",
    name: "Proforma Invoice",
    description:
      "Проформа-инвойс с водяным знаком, банковскими реквизитами и условиями",
    category: "business",
    features: [
      "Водяной знак PROFORMA",
      "Банковские реквизиты",
      "Условия оплаты",
      "Условия доставки",
    ],
    colors: {
      primary: "#1E40AF",
      secondary: "#6B7280",
      accent: "#EFF6FF",
    },
    preview: "/templates/previews/proforma.png",
  },
};

export const getTemplateMetadata = (
  templateId: string,
): TemplateMetadata | undefined => {
  return TEMPLATE_METADATA[templateId];
};

export const getAllTemplates = (): TemplateMetadata[] => {
  return Object.values(TEMPLATE_METADATA);
};

export const getTemplatesByCategory = (
  category: string,
): TemplateMetadata[] => {
  return Object.values(TEMPLATE_METADATA).filter(
    (template) => template.category === category,
  );
};
