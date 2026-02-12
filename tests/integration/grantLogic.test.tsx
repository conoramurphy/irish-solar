import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { getEligibleGrants } from '../../src/models/grants';
import { Grant, BusinessType } from '../../src/types';

// Mock grants data
const MOCK_GRANTS: Grant[] = [
  {
    id: 'tams-scis',
    name: 'TAMS 3',
    type: 'TAMS',
    percentage: 60,
    maxAmount: 54000,
    eligibleFor: ['farm'], // Only for farms
  },
  {
    id: 'seai-commercial',
    name: 'SEAI Commercial',
    type: 'SEAI',
    percentage: 0,
    maxAmount: 162600,
    eligibleFor: ['hotel', 'commercial', 'farm', 'other'], // Broad eligibility
  }
];

// Define all business types we want to test
const ALL_BUSINESS_TYPES: BusinessType[] = ['hotel', 'farm', 'commercial', 'other'];

describe('Business Type to Grant Mapping', () => {
  // Dynamic test generation for all business types
  ALL_BUSINESS_TYPES.forEach((type) => {
    it(`correctly filters grants for business type: ${type}`, () => {
      const grants = getEligibleGrants(type, MOCK_GRANTS);
      const grantIds = grants.map(g => g.id);

      // Verify each mock grant against its 'eligibleFor' list
      MOCK_GRANTS.forEach(mockGrant => {
        if (mockGrant.eligibleFor.includes(type)) {
          expect(grantIds).toContain(mockGrant.id);
        } else {
          expect(grantIds).not.toContain(mockGrant.id);
        }
      });
    });
  });
});

describe('Step 4 Grant Mutual Exclusivity Logic', () => {
  // Simulate the logic inside Step4Finance's onChange handler
  const useGrantSelection = (initialGrants: Grant[]) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const toggleGrant = (grant: Grant, isChecked: boolean) => {
      if (isChecked) {
        // Core logic from Step4Finance
        const newGrantType = grant.type;
        const conflictingType = newGrantType === 'TAMS' ? 'SEAI' : newGrantType === 'SEAI' ? 'TAMS' : null;

        let newSelectedIds = [...selectedIds];
        
        if (conflictingType) {
          // Find IDs of conflicting grants
          const conflictingIds = initialGrants
            .filter(cg => cg.type === conflictingType)
            .map(cg => cg.id);
          
          // Remove them
          newSelectedIds = newSelectedIds.filter(id => !conflictingIds.includes(id));
        }
        
        setSelectedIds([...newSelectedIds, grant.id]);
      } else {
        setSelectedIds(prev => prev.filter(id => id !== grant.id));
      }
    };

    return { selectedIds, toggleGrant };
  };

  it('deselects SEAI grant when TAMS grant is selected', () => {
    const { result } = renderHook(() => useGrantSelection(MOCK_GRANTS));

    // 1. Select SEAI grant first
    const seaiGrant = MOCK_GRANTS.find(g => g.id === 'seai-commercial')!;
    act(() => {
      result.current.toggleGrant(seaiGrant, true);
    });
    expect(result.current.selectedIds).toEqual(['seai-commercial']);

    // 2. Select TAMS grant
    const tamsGrant = MOCK_GRANTS.find(g => g.id === 'tams-scis')!;
    act(() => {
      result.current.toggleGrant(tamsGrant, true);
    });

    // 3. SEAI should be gone, only TAMS remains
    expect(result.current.selectedIds).toEqual(['tams-scis']);
  });

  it('deselects TAMS grant when SEAI grant is selected', () => {
    const { result } = renderHook(() => useGrantSelection(MOCK_GRANTS));

    // 1. Select TAMS grant first
    const tamsGrant = MOCK_GRANTS.find(g => g.id === 'tams-scis')!;
    act(() => {
      result.current.toggleGrant(tamsGrant, true);
    });
    expect(result.current.selectedIds).toEqual(['tams-scis']);

    // 2. Select SEAI grant
    const seaiGrant = MOCK_GRANTS.find(g => g.id === 'seai-commercial')!;
    act(() => {
      result.current.toggleGrant(seaiGrant, true);
    });

    // 3. TAMS should be gone, only SEAI remains
    expect(result.current.selectedIds).toEqual(['seai-commercial']);
  });
});
