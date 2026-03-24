import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const links = [
  { path: '/', description: 'Homepage' },
  { path: '/full-model', description: 'Solar & Battery Modeller' },
  { path: '/tariffs', description: 'Tariff Modeller' },
  { path: '/heat-pump', description: 'Heat Pump ROI Calculator' },
  { path: '/r', description: 'All Reports' },
  { path: '/links', description: 'Sitemap' },
];

export default function LinksPage() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  return (
    <div
      style={{
        backgroundColor: '#0a0a0a',
        color: '#00ff41',
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace',
        minHeight: '100vh',
        padding: '2rem',
        fontSize: '14px',
        lineHeight: '1.6',
      }}
    >
      <div style={{ maxWidth: '640px' }}>
        <pre style={{ margin: 0, color: '#555' }}>
{`┌──────────────────────────────────────┐
│  wattprofit.ie // sitemap            │
└──────────────────────────────────────┘`}
        </pre>

        <div style={{ marginTop: '1.5rem', color: '#888' }}>
          <span>$ ls -la /</span>
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ color: '#555', marginBottom: '0.25rem' }}>
            total {links.length}
          </div>
          {links.map(({ path, description }) => (
            <div key={path} style={{ display: 'flex', gap: '1rem', whiteSpace: 'pre' }}>
              <span style={{ color: '#555' }}>drwxr-xr-x</span>
              <Link
                to={path}
                style={{
                  color: '#00ff41',
                  textDecoration: 'none',
                  minWidth: '160px',
                  display: 'inline-block',
                }}
              >
                {path.padEnd(20)}
              </Link>
              <span style={{ color: '#888' }}>{description}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '2rem', color: '#555' }}>
          <span>$ █</span>
        </div>
      </div>
    </div>
  );
}
