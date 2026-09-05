import Link from 'next/link';
import { type Dictionary } from '@/i18n';
import { ctaHref } from '@/lib/links';
import { CheckCircleIcon, CheckIcon } from './Icons';

export function PricingPlans({ t }: { t: Dictionary }) {
  const p = t.pricing;
  return (
    <div className="plans">
      <div className="plan-card">
        <div className="plan-name">{p.freeName}</div>
        <div className="plan-price">{p.freePrice}</div>
        <div className="secondary">{p.freeNote}</div>
        <ul className="plan-list">
          {p.rows
            .filter((r) => r.free !== '—')
            .map((r) => (
              <li key={r.label}>
                <CheckIcon size={16} />
                <span>
                  {r.label}
                  {r.free !== '✓' && <span className="plan-list-value"> · {r.free}</span>}
                </span>
              </li>
            ))}
        </ul>
        <Link href={ctaHref()} className="btn btn-secondary btn-block">
          {p.ctaFree}
        </Link>
      </div>
      <div className="plan-card plan-card-pro">
        <div className="plan-name-row">
          <span className="plan-name">{p.proName}</span>
          <span className="badge badge-success">{p.bestValue}</span>
        </div>
        <div className="plan-options">
          <div className="plan-option plan-option-selected">
            <span className="plan-option-title">{p.annual}</span>
            <span className="plan-price">{p.annualPrice}</span>
            <span className="secondary">{p.annualDetail}</span>
          </div>
          <div className="plan-option">
            <span className="plan-option-title">{p.monthly}</span>
            <span className="plan-price plan-price-sm">{p.monthlyPrice}</span>
          </div>
        </div>
        <ul className="plan-list">
          {p.proIncludes.map((item) => (
            <li key={item}>
              <CheckCircleIcon size={16} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <Link href={ctaHref()} className="btn btn-primary btn-block">
          {p.ctaPro}
        </Link>
        <p className="caption plan-legal">{p.trialNote}</p>
      </div>
    </div>
  );
}

export function PricingTable({ t }: { t: Dictionary }) {
  const p = t.pricing;
  return (
    <div className="table-wrap">
      <table className="plan-table">
        <thead>
          <tr>
            <th scope="col">{p.tableFeature}</th>
            <th scope="col">{p.freeName}</th>
            <th scope="col" className="th-pro">
              {p.proName}
            </th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.free}</td>
              <td className="td-pro">{r.pro === '✓' ? <CheckCircleIcon size={18} /> : r.pro}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
