import { useEffect, useState } from 'react';
import type { Tariff } from '../types';
import { domesticTariffs } from '../utils/domesticTariffParser';

interface DomesticTariffSelectorProps {
  selectedTariffId?: string;
  onSelect: (tariff: Tariff) => void;
}

export function DomesticTariffSelector({ selectedTariffId, onSelect }: DomesticTariffSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  // Group tariffs by supplier
  const tariffsBySupplier = domesticTariffs.reduce((acc, tariff) => {
    if (!acc[tariff.supplier]) {
      acc[tariff.supplier] = [];
    }
    acc[tariff.supplier].push(tariff);
    return acc;
  }, {} as Record<string, Tariff[]>);

  const suppliers = Object.keys(tariffsBySupplier).sort();

  // Filter tariffs by search term
  const filteredSuppliers = suppliers.filter(supplier => {
    if (!searchTerm) return true;
    const lowerSearch = searchTerm.toLowerCase();
    return (
      supplier.toLowerCase().includes(lowerSearch) ||
      tariffsBySupplier[supplier].some(t => t.product.toLowerCase().includes(lowerSearch))
    );
  });

  // Auto-expand if searching
  useEffect(() => {
    if (searchTerm) {
      setExpandedSuppliers(new Set(filteredSuppliers));
    }
  }, [searchTerm, filteredSuppliers]);

  const toggleSupplier = (supplier: string) => {
    const newExpanded = new Set(expandedSuppliers);
    if (newExpanded.has(supplier)) {
      newExpanded.delete(supplier);
    } else {
      newExpanded.add(supplier);
    }
    setExpandedSuppliers(newExpanded);
  };

  const formatRate = (rate: number | undefined): string => {
    if (rate === undefined) return 'N/A';
    return `€${(rate * 100).toFixed(2)}c/kWh`;
  };

  const formatStandingCharge = (daily: number): string => {
    const yearly = daily * 365;
    return `€${yearly.toFixed(2)}/yr`;
  };

  const getTariffFeatures = (tariff: Tariff): string[] => {
    const features: string[] = [];
    
    if (tariff.evRate) {
      features.push(`EV Charging: ${formatRate(tariff.evRate)}`);
    }
    
    if (tariff.freeElectricityWindow) {
      features.push(`Free: ${tariff.freeElectricityWindow.description}`);
    }
    
    if (tariff.peakRate && tariff.nightRate) {
      features.push('Time-of-Use');
    }
    
    if (tariff.flatRate) {
      features.push('Flat Rate');
    }
    
    return features;
  };

  const getTariffComplexity = (tariff: Tariff): 'simple' | 'moderate' | 'complex' => {
    const rateCount = tariff.rates.length;
    const hasEv = !!tariff.evRate;
    const hasFree = !!tariff.freeElectricityWindow;
    
    if (tariff.flatRate && !hasEv && !hasFree) return 'simple';
    if (rateCount <= 2 && !hasEv && !hasFree) return 'moderate';
    return 'complex';
  };

  return (
    <div className="domestic-tariff-selector">
      <div className="tariff-selector-header">
        <h3>Select Your Electricity Tariff</h3>
        <p className="text-sm text-gray-600">
          Choose the tariff that matches your current electricity plan
        </p>
      </div>

      <div className="search-box mb-4">
        <input
          type="text"
          placeholder="Search suppliers or plans..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="suppliers-list space-y-2">
        {filteredSuppliers.map(supplier => {
          const isExpanded = expandedSuppliers.has(supplier);
          const supplierTariffs = tariffsBySupplier[supplier].filter(t => {
            if (!searchTerm) return true;
            return t.product.toLowerCase().includes(searchTerm.toLowerCase());
          });

          if (supplierTariffs.length === 0) return null;

          return (
            <div key={supplier} className="supplier-group border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSupplier(supplier)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
              >
                <span className="font-semibold text-left">{supplier}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{supplierTariffs.length} plans</span>
                  <span className="text-gray-400">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="tariffs-list divide-y divide-gray-100">
                  {supplierTariffs.map(tariff => {
                    const isSelected = tariff.id === selectedTariffId;
                    const features = getTariffFeatures(tariff);
                    const complexity = getTariffComplexity(tariff);

                    return (
                      <div
                        key={tariff.id}
                        onClick={() => onSelect(tariff)}
                        className={`
                          tariff-item p-4 cursor-pointer transition-colors
                          ${isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{tariff.product}</h4>
                              {complexity === 'simple' && (
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                  Simple
                                </span>
                              )}
                              {complexity === 'complex' && (
                                <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                                  Multi-rate
                                </span>
                              )}
                            </div>

                            <div className="text-sm text-gray-600 space-y-1">
                              <div className="flex gap-4 flex-wrap">
                                {tariff.flatRate && (
                                  <span>Flat: {formatRate(tariff.flatRate)}</span>
                                )}
                                {tariff.nightRate && !tariff.flatRate && (
                                  <>
                                    <span>Day: {formatRate(tariff.rates.find(r => r.period === 'day')?.rate)}</span>
                                    <span>Night: {formatRate(tariff.nightRate)}</span>
                                  </>
                                )}
                                {tariff.peakRate && (
                                  <span>Peak: {formatRate(tariff.peakRate)}</span>
                                )}
                              </div>
                              
                              <div className="text-gray-500">
                                Standing charge: {formatStandingCharge(tariff.standingCharge)}
                              </div>

                              {features.length > 0 && (
                                <div className="flex gap-2 flex-wrap mt-2">
                                  {features.map((feature, idx) => (
                                    <span
                                      key={idx}
                                      className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded"
                                    >
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {isSelected && (
                            <div className="ml-4">
                              <span className="text-blue-600 text-xl">✓</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredSuppliers.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No tariffs found matching "{searchTerm}"
        </div>
      )}
    </div>
  );
}
