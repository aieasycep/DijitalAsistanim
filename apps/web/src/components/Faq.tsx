import { ChevronDownIcon } from './Icons';

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="faq">
      {items.map((item) => (
        <details className="faq-item" key={item.q}>
          <summary>
            <span>{item.q}</span>
            <ChevronDownIcon size={20} className="faq-chevron" />
          </summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}
