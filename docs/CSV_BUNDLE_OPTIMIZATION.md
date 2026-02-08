# CSV Bundle Optimization Strategies

## Problem Statement

Historically, the solar ROI calculator bundled PVGIS solar irradiance CSV files directly into the JavaScript bundle. This has since been replaced with dynamic fetching from `/data/solar/{Location}_{Year}.csv` (served from `public/data/solar/`) via `src/utils/solarDataLoader.ts`.

**Scaling challenge**: With plans to support:
- 32 Irish counties
- 10 years of historical data per location
- Multiple scenarios/comparisons

The total dataset could reach **320-450MB uncompressed** (10-15MB gzipped), making the current bundling approach untenable.

---

## Strategy 1: Dynamic Fetching with Edge Caching (Recommended)

### Overview
Move solar CSV files out of the JS bundle and serve them as static assets, fetched on-demand when a location is selected. Use CDN/edge caching for fast delivery.

### Architecture

```
User selects location
    ↓
App checks in-memory cache
    ↓
If not cached:
    ├→ Fetch CSV from /data/solar/{location}_{year}.csv
    ├→ CDN/Edge serves from cache (after first request)
    ├→ Parse in browser
    └→ Store in memory for session
```

### Implementation Details

#### 1. File Organization
```
public/
  data/
    solar/
      Cavan_2020.csv          (1.4 MB)
      Cavan_2021.csv
      ...
      Dublin_2020.csv
      Cork_2020.csv
      ...
```

#### 2. Lazy Loading Module

```typescript
// src/utils/solarDataLoader.ts
interface SolarDataCache {
  [key: string]: ParsedSolarData;
}

const cache: SolarDataCache = {};

export async function loadSolarData(
  location: string, 
  year: number
): Promise<ParsedSolarData> {
  const cacheKey = `${location}_${year}`;
  
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const response = await fetch(`/data/solar/${location}_${year}.csv`);
  if (!response.ok) {
    throw new Error(`Failed to load solar data for ${location} ${year}`);
  }
  
  const csvContent = await response.text();
  const parsed = parseSolarTimeseriesCSV(csvContent, location);
  
  cache[cacheKey] = parsed;
  return parsed;
}
```

#### 3. UI Changes in Step 2

```typescript
// src/components/steps/Step2SolarInstallation.tsx
useEffect(() => {
  if (!config.location) return;
  
  setLoading(true);
  
  loadSolarData(config.location, selectedYear)
    .then((data) => {
      setSolarData(data);
      setLoading(false);
    })
    .catch((err) => {
      logError('solar', 'Failed to load solar data', { error: err.message });
      setLoading(false);
    });
}, [config.location, selectedYear]);
```

#### 4. Build Configuration (Vite)

```typescript
// vite.config.ts
export default defineConfig({
  publicDir: 'public', // Ensures /public/data/* copied to dist
  build: {
    rollupOptions: {
      external: [/^\/data\/solar\/.+\.csv$/] // Don't bundle CSVs
    }
  }
});
```

### Deployment

#### CDN Setup (Cloudflare/Vercel/Netlify)
- Enable edge caching with `Cache-Control: public, max-age=31536000, immutable`
- Solar data rarely changes → aggressive caching is safe
- First user request pulls from origin, subsequent requests from edge
- **Result**: ~50-200ms latency for cached files (worldwide)

#### Pre-warming Strategy
- On app boot, pre-fetch top 3-5 most common locations in background
- Store in cache before user selects
- Provides instant UX for popular choices

### Advantages
✅ **Zero bundle bloat**: Main JS bundle stays small  
✅ **Pay-as-you-go**: Only download data for selected locations  
✅ **Easy scaling**: Add 100 locations without affecting initial load  
✅ **Browser caching**: Data persists across sessions  
✅ **CDN benefits**: Fast delivery worldwide  
✅ **No data expiry issues**: Update files independently of app deploys  

### Disadvantages
⚠️ **Network dependency**: Requires internet (not offline-first)  
⚠️ **First-load latency**: 1-2 second delay when selecting new location  
⚠️ **CDN costs**: Bandwidth costs scale with users (but minimal for text)  
⚠️ **CORS considerations**: Must serve from same origin or configure CORS  

### Cost Analysis
- **Storage**: ~10-15MB × # of locations = minimal cloud storage cost
- **Bandwidth**: ~1-2MB per user per location = $0.08/GB on Cloudflare
- **Example**: 10,000 users, 2 locations average = 20GB = **$1.60/month**

---

## Strategy 2: Compressed Binary Format with IndexedDB (Advanced)

### Overview
Pre-process CSV files into a compact binary format, compress with Brotli/Gzip, and store in IndexedDB for offline access. Download on-demand, decompress, and cache indefinitely.

### Architecture

```
Build Time:
  CSV → Parse → Binary Format → Brotli Compress → .br files

Runtime:
  User selects location
    ↓
  Check IndexedDB
    ↓
  If not cached:
    ├→ Fetch compressed binary from /data/solar/{location}_{year}.bin.br
    ├→ Decompress (browser native)
    ├→ Parse binary to ParsedSolarData
    ├→ Store in IndexedDB
    └→ Return data
  If cached:
    └→ Retrieve from IndexedDB (instant)
```

### Binary Format Design

```typescript
// Compact binary layout (BigEndian)
// Header (48 bytes):
//   - Magic: "PVGIS" (5 bytes)
//   - Version: uint8 (1 byte)
//   - Year: uint16 (2 bytes)
//   - Location length: uint8 (1 byte)
//   - Location: UTF-8 string (variable)
//   - Latitude: float32 (4 bytes)
//   - Longitude: float32 (4 bytes)
//   - Elevation: float32 (4 bytes)
//   - Total hours: uint16 (2 bytes)
//
// Timestep array (8 bytes per hour):
//   - Month: uint8 (1 byte, 0-11)
//   - Day: uint8 (1 byte, 1-31)
//   - Hour: uint8 (1 byte, 0-23)
//   - Irradiance: uint16 (2 bytes, W/m² * 10 for precision)
//   - Reserved: uint16 (2 bytes, for future use)

// Size calculation:
// - Header: ~50 bytes
// - Data: 8 bytes × 8,760 hours = 70,080 bytes
// Total: ~70 KB uncompressed
// Brotli compressed: ~15-25 KB (5-7x reduction)
```

### Implementation

#### 1. Build-time converter

```typescript
// scripts/compressSolarData.ts
import { parseSolarTimeseriesCSV } from '../src/utils/solarTimeseriesParser';
import { compress } from 'brotli';

function convertToBinary(csvPath: string, outputPath: string) {
  const csv = fs.readFileSync(csvPath, 'utf-8');
  const data = parseSolarTimeseriesCSV(csv, locationName);
  
  const buffer = new ArrayBuffer(50 + data.timesteps.length * 8);
  const view = new DataView(buffer);
  
  // Write header
  let offset = 0;
  writeString(view, offset, 'PVGIS');
  offset += 5;
  view.setUint8(offset++, 1); // version
  view.setUint16(offset, data.year);
  offset += 2;
  // ... write remaining header fields
  
  // Write timesteps
  data.timesteps.forEach((ts, idx) => {
    const base = headerSize + idx * 8;
    view.setUint8(base, ts.stamp.monthIndex);
    view.setUint8(base + 1, ts.stamp.day);
    view.setUint8(base + 2, ts.stamp.hour);
    view.setUint16(base + 3, Math.round(ts.irradianceWm2 * 10));
  });
  
  // Compress with Brotli
  const compressed = compress(Buffer.from(buffer));
  fs.writeFileSync(outputPath, compressed);
}
```

#### 2. Runtime loader with IndexedDB

```typescript
// src/utils/solarBinaryLoader.ts
import { openDB, DBSchema } from 'idb';

interface SolarDB extends DBSchema {
  'solar': {
    key: string; // "{location}_{year}"
    value: ParsedSolarData;
  };
}

const dbPromise = openDB<SolarDB>('solar-data', 1, {
  upgrade(db) {
    db.createObjectStore('solar');
  }
});

export async function loadSolarDataBinary(
  location: string, 
  year: number
): Promise<ParsedSolarData> {
  const key = `${location}_${year}`;
  const db = await dbPromise;
  
  // Check IndexedDB first
  const cached = await db.get('solar', key);
  if (cached) return cached;
  
  // Fetch compressed binary
  const response = await fetch(`/data/solar/${location}_${year}.bin.br`);
  const compressedBuffer = await response.arrayBuffer();
  
  // Browser auto-decompresses if Content-Encoding: br is set
  // Otherwise use DecompressionStream API
  const buffer = compressedBuffer; // Already decompressed by browser
  
  // Parse binary format
  const data = parseBinarySolarData(buffer, location);
  
  // Store in IndexedDB
  await db.put('solar', data, key);
  
  return data;
}

function parseBinarySolarData(buffer: ArrayBuffer, location: string): ParsedSolarData {
  const view = new DataView(buffer);
  let offset = 0;
  
  // Parse header
  const magic = readString(view, offset, 5);
  if (magic !== 'PVGIS') throw new Error('Invalid binary format');
  offset += 5;
  
  const version = view.getUint8(offset++);
  const year = view.getUint16(offset);
  offset += 2;
  // ... read remaining header
  
  // Parse timesteps
  const timesteps: SolarTimestep[] = [];
  for (let i = 0; i < totalHours; i++) {
    const base = headerSize + i * 8;
    const monthIndex = view.getUint8(base);
    const day = view.getUint8(base + 1);
    const hour = view.getUint8(base + 2);
    const irradiance = view.getUint16(base + 3) / 10; // Scale back
    
    timesteps.push({
      stamp: { year, monthIndex, day, hour },
      hourKey: toHourKey({ year, monthIndex, day, hour }),
      irradianceWm2: irradiance,
      timestamp: new Date(Date.UTC(year, monthIndex, day, hour)),
      sourceIndex: i
    });
  }
  
  return {
    location,
    year,
    timesteps,
    latitude, longitude, elevation,
    totalIrradiance: timesteps.reduce((s, ts) => s + ts.irradianceWm2, 0)
  };
}
```

### Advantages
✅ **Ultra-compact**: 20-25KB per location/year (20x smaller than CSV)  
✅ **Offline-first**: Data persists in IndexedDB across sessions  
✅ **Instant re-access**: No network latency after first load  
✅ **Lower bandwidth costs**: 25KB vs 1.4MB per location  
✅ **Parse performance**: Binary parsing ~5-10x faster than CSV  
✅ **Version control**: Binary format can evolve with versioning  

### Disadvantages
⚠️ **Build complexity**: Requires custom tooling for CSV → binary conversion  
⚠️ **Browser compatibility**: IndexedDB well-supported but adds complexity  
⚠️ **Debugging difficulty**: Binary files not human-readable  
⚠️ **Storage quotas**: IndexedDB has browser-specific limits (usually 50MB+)  
⚠️ **Initial dev cost**: 2-3 days to implement and test  

### Cost Analysis
- **Storage**: Same as Strategy 1 (10-15MB)
- **Bandwidth**: 25KB per location vs 1.4MB = **~56x reduction**
- **Example**: 10,000 users, 2 locations = 500MB = **$0.04/month**

---

## Comparison Matrix

| Criterion | Strategy 1: Dynamic Fetch | Strategy 2: Binary + IndexedDB |
|-----------|---------------------------|-------------------------------|
| **Initial bundle size** | Small (no CSVs) | Small (no CSVs) |
| **Per-location size** | 1.4MB (CSV) | 20-25KB (binary) |
| **First-load latency** | 1-2s | 0.5-1s |
| **Repeat-load latency** | 50-200ms (CDN cache) | 0ms (IndexedDB) |
| **Offline support** | ❌ No | ✅ Yes |
| **Implementation complexity** | ⭐ Low | ⭐⭐⭐ Medium-High |
| **Bandwidth cost (10k users)** | $1.60/month | $0.04/month |
| **Data updates** | Simple (replace CSV) | Requires rebuild |
| **Browser compatibility** | 100% | 98% (IndexedDB) |
| **Developer experience** | Excellent | Good |
| **Debugging** | Easy (view CSV in browser) | Hard (binary format) |

---

## Recommendation

### For Immediate Implementation (Next 1-2 Weeks)
**Use Strategy 1: Dynamic Fetching with Edge Caching**

**Why:**
- Fastest to implement (1-2 days)
- Solves immediate scaling problem (bundle size)
- Standard web pattern (proven, well-understood)
- Easy to maintain and debug
- CDN costs are negligible for text files
- No offline requirement stated

### For Future Optimization (3-6 Months)
**Consider Strategy 2: Binary Format**

**When:**
- User base grows >50k monthly active users (bandwidth costs become significant)
- Offline support becomes a product requirement
- Mobile/low-bandwidth users report slow load times
- Multi-scenario comparison feature launches (needs instant data switching)

### Hybrid Approach (Best of Both)
Combine strategies:
1. Start with Strategy 1 for all locations
2. Pre-cache top 3-5 locations in IndexedDB using Strategy 2 format
3. Lazy-load remaining locations via Strategy 1

This provides:
- Instant access for 80% of users (common locations)
- Graceful fallback for less common locations
- Offline support for most users
- Manageable implementation complexity

---

## Implementation Checklist

### Strategy 1 (Recommended)
- [ ] Move CSV files from `src/data/` to `public/data/solar/`
- [ ] Update Vite config to exclude CSVs from bundle
- [ ] Implement `loadSolarData()` function with fetch + cache
- [ ] Update Step2 component to use async loading
- [ ] Add loading spinner + error handling UI
- [ ] Configure CDN caching headers (`Cache-Control`)
- [ ] Test with multiple locations
- [ ] Measure bundle size reduction (expect ~95% reduction)
- [ ] Add pre-warming for top 3 locations
- [ ] Document usage in AGENTS.md

### Strategy 2 (Future)
- [ ] Design binary format specification
- [ ] Implement build-time CSV → binary converter
- [ ] Add Brotli compression step
- [ ] Implement binary parser in browser
- [ ] Integrate IndexedDB with `idb` library
- [ ] Add data versioning + migration logic
- [ ] Test storage quota handling
- [ ] Benchmark parse performance
- [ ] Add fallback to Strategy 1 if IndexedDB unavailable
- [ ] Document binary format in separate spec document

---

## Performance Benchmarks (Projected)

### Current State (Bundled CSVs)
- Bundle size: 1.7MB (400KB gzipped) for 1 location
- First contentful paint: 2-3s
- Time to interactive: 3-4s

### Strategy 1 (Dynamic Fetch)
- Bundle size: 280KB (85KB gzipped)
- First contentful paint: 0.8-1.2s
- Time to interactive: 1.5-2s
- Location load time: 1-2s (first), 50-200ms (cached)

### Strategy 2 (Binary + IndexedDB)
- Bundle size: 280KB (85KB gzipped)
- First contentful paint: 0.8-1.2s
- Time to interactive: 1.5-2s
- Location load time: 0.5-1s (first), 0ms (cached)

---

## Conclusion

**Start with Strategy 1** for immediate impact with minimal risk. The 95% bundle size reduction and sub-second CDN-cached load times will provide excellent UX for the vast majority of users. As the product matures and requirements evolve, Strategy 2 can be selectively applied to high-traffic locations or as a premium feature for power users.

Both strategies are production-proven patterns used by major web applications. The choice between them is primarily about balancing implementation time vs. optimization gains, not technical feasibility.
