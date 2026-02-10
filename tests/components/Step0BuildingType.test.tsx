import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step0BuildingType from '../../src/components/steps/Step0BuildingType';

describe('Step0BuildingType', () => {
  it('renders 4 building type cards', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    expect(screen.getByText('Hotel (open all year round)')).toBeInTheDocument();
    expect(screen.getByText('House')).toBeInTheDocument();
    expect(screen.getByText('Farm')).toBeInTheDocument();
    expect(screen.getByText('Seasonal hotel')).toBeInTheDocument();
  });

  it('only hotel-year-round card is clickable', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    // Find all cards - hotel should not have "Coming Soon" in its card
    const cards = screen.getAllByRole('button');
    
    // Hotel card should be enabled (first button without "Coming Soon" nearby)
    const hotelCard = cards.find(card => 
      card.textContent?.includes('Hotel') && 
      card.textContent?.includes('open all year round')
    );
    expect(hotelCard).toBeInTheDocument();
    expect(hotelCard).not.toBeDisabled();
  });

  it('calls onNext with hotel-year-round when hotel card is clicked', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    const hotelCard = screen.getByRole('button', { name: /Hotel \(open all year round\)/i });
    fireEvent.click(hotelCard);

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledWith({ buildingType: 'hotel-year-round' });
  });

  it('displays "Coming soon" for house, farm, and seasonal hotel', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    // Should have 3 "Coming soon" labels (for house, farm, seasonal hotel)
    const comingSoonLabels = screen.getAllByText(/Coming soon/i);
    expect(comingSoonLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('disabled cards are not clickable', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    // Find disabled cards
    const cards = screen.getAllByRole('button');
    const disabledCards = cards.filter(card => 
      card.hasAttribute('disabled') || card.classList.contains('cursor-not-allowed')
    );

    // Try clicking each disabled card
    for (const card of disabledCards) {
      await user.click(card);
    }

    // onNext should not have been called
    expect(onNext).not.toHaveBeenCalled();
  });
});
