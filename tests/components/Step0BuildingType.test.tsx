import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step0BuildingType from '../../src/components/steps/Step0BuildingType';

describe('Step0BuildingType', () => {
  it('renders 3 building type cards', () => {
    const onNext = vi.fn();
    render(<Step0BuildingType onNext={onNext} />);

    expect(screen.getByText('Hotel / Business')).toBeInTheDocument();
    expect(screen.getByText('House')).toBeInTheDocument();
    expect(screen.getByText('Farm')).toBeInTheDocument();
  });

  it('hotel-year-round card is clickable', () => {
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

});
