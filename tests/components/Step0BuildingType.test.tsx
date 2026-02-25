import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step0BuildingType from '../../src/components/steps/Step0BuildingType';

describe('Step0BuildingType', () => {
  it('renders 4 building type cards', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    expect(screen.getByText('Hotel')).toBeInTheDocument();
    expect(screen.getByText('House')).toBeInTheDocument();
    expect(screen.getByText('Farm')).toBeInTheDocument();
    expect(screen.getByText('Seasonal hotel')).toBeInTheDocument();
  });

  it('only hotel-year-round card is clickable', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    const cards = screen.getAllByRole('button');

    // Hotel card is the enabled one that mentions "Year-round commercial"
    const hotelCard = cards.find(card =>
      card.textContent?.includes('Hotel') &&
      card.textContent?.includes('Year-round commercial')
    );
    expect(hotelCard).toBeInTheDocument();
    expect(hotelCard).not.toBeDisabled();
  });

  it('calls onNext with hotel-year-round when hotel card is clicked', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    const cards = screen.getAllByRole('button');
    const hotelCard = cards.find(card =>
      card.textContent?.includes('Year-round commercial')
    );
    expect(hotelCard).toBeDefined();
    fireEvent.click(hotelCard!);

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledWith({ buildingType: 'hotel-year-round' });
  });

  it('displays "Coming soon" for farm and seasonal hotel', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    // Should have 2 "Coming soon" badges (farm and seasonal hotel)
    const comingSoonBadges = screen.getAllByText('Coming soon');
    expect(comingSoonBadges.length).toBe(2);
  });

  it('disabled cards are not clickable', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    const cards = screen.getAllByRole('button');
    const disabledCards = cards.filter(card =>
      card.hasAttribute('disabled') || card.classList.contains('cursor-not-allowed')
    );

    for (const card of disabledCards) {
      await user.click(card);
    }

    expect(onNext).not.toHaveBeenCalled();
  });
});
