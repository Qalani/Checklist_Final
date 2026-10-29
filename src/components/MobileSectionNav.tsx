'use client';

interface MobileSectionNavProps {
  value: string;
  onChange: (value: string) => void;
  sections: ReadonlyArray<{ value: string; label: string }>;
}

/** Direct access to the panels that sit side by side on larger screens. */
export default function MobileSectionNav({ value, onChange, sections }: MobileSectionNavProps) {
  return (
    <nav className="mobile-section-nav" aria-label="Page sections">
      {sections.map(section => (
        <button
          key={section.value}
          type="button"
          aria-pressed={value === section.value}
          onClick={() => onChange(section.value)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
