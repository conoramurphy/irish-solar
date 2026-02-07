import { describe, expect, it } from 'vitest';
import { parseSolarTimeseriesCSV } from '../../src/utils/solarTimeseriesParser';

describe('parseSolarTimeseriesCSV - CSV format validation', () => {
  const validCSV = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101
Radiation database:\tPVGIS-SARAH3

Slope: 0 deg. 
Azimuth: 100 deg. 
time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,0.0,0.0,5.63,1.45,0.0
20200101:0111,0.0,0.0,5.85,1.52,0.0
20200101:0211,10.5,10.0,6.00,1.60,0.0
`;

  it('should parse a valid PVGIS CSV', () => {
    const result = parseSolarTimeseriesCSV(validCSV, 'TestLocation');
    
    expect(result.location).toBe('TestLocation');
    expect(result.latitude).toBeCloseTo(53.835, 3);
    expect(result.longitude).toBeCloseTo(-7.072, 3);
    expect(result.elevation).toBe(101);
    expect(result.timesteps).toHaveLength(3);
    expect(result.year).toBe(2020);
  });

  it('should throw error for completely empty CSV', () => {
    expect(() => parseSolarTimeseriesCSV('', 'Test')).toThrow();
  });

  it('should throw error when data header is missing', () => {
    const noHeader = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

20200101:0011,0.0,0.0,5.63,1.45,0.0
`;
    
    expect(() => parseSolarTimeseriesCSV(noHeader, 'Test')).toThrow('Could not find data header');
  });

  it('should handle CSV with only headers (no data rows)', () => {
    const onlyHeaders = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101
Radiation database:\tPVGIS-SARAH3

time,G(i),H_sun,T2m,WS10m,Int
`;
    
    const result = parseSolarTimeseriesCSV(onlyHeaders, 'Test');
    expect(result.timesteps).toHaveLength(0);
    expect(result.totalIrradiance).toBe(0);
  });

  it('should skip rows with malformed time strings', () => {
    const malformedTime = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
INVALID_TIME,20.0,0.0,5.63,1.45,0.0
20200101:0211,15.0,0.0,5.63,1.45,0.0
`;
    
    const result = parseSolarTimeseriesCSV(malformedTime, 'Test');
    expect(result.timesteps).toHaveLength(2); // Skip the invalid row
    expect(result.timesteps[0].irradianceWm2).toBe(10.0);
    expect(result.timesteps[1].irradianceWm2).toBe(15.0);
  });

  it('should skip rows with insufficient columns', () => {
    const insufficientColumns = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
20200101:0111
20200101:0211,15.0,0.0,5.63,1.45,0.0
`;
    
    const result = parseSolarTimeseriesCSV(insufficientColumns, 'Test');
    expect(result.timesteps).toHaveLength(2); // Skip row with insufficient columns
  });

  it('should clamp negative irradiance values to zero', () => {
    const negativeIrradiance = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
20200101:0111,-5.0,0.0,5.63,1.45,0.0
20200101:0211,15.0,0.0,5.63,1.45,0.0
`;
    
    const result = parseSolarTimeseriesCSV(negativeIrradiance, 'Test');
    expect(result.timesteps[0].irradianceWm2).toBe(10.0);
    expect(result.timesteps[1].irradianceWm2).toBe(0); // Clamped to 0
    expect(result.timesteps[2].irradianceWm2).toBe(15.0);
  });

  it('should handle non-numeric irradiance values as zero', () => {
    const nonNumeric = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
20200101:0111,NOT_A_NUMBER,0.0,5.63,1.45,0.0
20200101:0211,15.0,0.0,5.63,1.45,0.0
`;
    
    const result = parseSolarTimeseriesCSV(nonNumeric, 'Test');
    expect(result.timesteps[1].irradianceWm2).toBe(0); // Non-numeric treated as 0
  });

  it('should handle missing metadata gracefully', () => {
    const noMetadata = `time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
20200101:0111,20.0,0.0,5.85,1.52,0.0
`;
    
    const result = parseSolarTimeseriesCSV(noMetadata, 'Test');
    expect(result.latitude).toBe(0); // Default to 0
    expect(result.longitude).toBe(0);
    expect(result.elevation).toBe(0);
    expect(result.timesteps).toHaveLength(2);
  });

  it('should handle Windows line endings (CRLF)', () => {
    const crlfCSV = "Latitude (decimal degrees):\t53.835\r\nLongitude (decimal degrees):\t-7.072\r\ntime,G(i),H_sun\r\n20200101:0011,10.0,0.0\r\n20200101:0111,20.0,0.0\r\n";
    
    const result = parseSolarTimeseriesCSV(crlfCSV, 'Test');
    expect(result.timesteps).toHaveLength(2);
  });

  it('should handle extra whitespace in data rows', () => {
    const extraWhitespace = `Latitude (decimal degrees):\t53.835

time,G(i),H_sun,T2m,WS10m,Int
  20200101:0011  ,  10.0  ,0.0,5.63,1.45,0.0  
20200101:0111,20.0,0.0,5.85,1.52,0.0
`;
    
    const result = parseSolarTimeseriesCSV(extraWhitespace, 'Test');
    // Parser should handle trimming or at least not crash
    expect(result.timesteps.length).toBeGreaterThan(0);
  });

  it('should skip blank/empty lines in data section', () => {
    const blankLines = `Latitude (decimal degrees):\t53.835

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0

20200101:0111,20.0,0.0,5.85,1.52,0.0

`;
    
    const result = parseSolarTimeseriesCSV(blankLines, 'Test');
    expect(result.timesteps).toHaveLength(2); // Blank lines are filtered
  });

  it('should handle dates with invalid month (> 12)', () => {
    const invalidMonth = `time,G(i),H_sun
20201301:0011,10.0,0.0
20200101:0111,20.0,0.0
`;
    
    const result = parseSolarTimeseriesCSV(invalidMonth, 'Test');
    expect(result.timesteps).toHaveLength(1); // Invalid month row should be skipped
    expect(result.timesteps[0].stamp.monthIndex).toBe(0);
  });

  it('should handle dates with invalid day (> 31)', () => {
    const invalidDay = `time,G(i),H_sun
20200132:0011,10.0,0.0
20200101:0111,20.0,0.0
`;
    
    const result = parseSolarTimeseriesCSV(invalidDay, 'Test');
    expect(result.timesteps).toHaveLength(1); // Invalid day row should be skipped
  });

  it('should handle invalid hour (> 23)', () => {
    const invalidHour = `time,G(i),H_sun
20200101:2511,10.0,0.0
20200101:0111,20.0,0.0
`;
    
    const result = parseSolarTimeseriesCSV(invalidHour, 'Test');
    expect(result.timesteps).toHaveLength(1); // Invalid hour row should be skipped
  });

  it('should parse multi-year CSV correctly', () => {
    const multiYear = `time,G(i),H_sun
20200101:0011,10.0,0.0
20200101:0111,20.0,0.0
20210101:0011,15.0,0.0
20210101:0111,25.0,0.0
`;
    
    const result = parseSolarTimeseriesCSV(multiYear, 'Test');
    expect(result.timesteps).toHaveLength(4);
    expect(result.year).toBe(2020); // First year encountered
    
    const years = new Set(result.timesteps.map(ts => ts.stamp.year));
    expect(years.size).toBe(2); // Both years present
    expect(years.has(2020)).toBe(true);
    expect(years.has(2021)).toBe(true);
  });
});
