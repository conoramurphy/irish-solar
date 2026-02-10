import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepIndicator } from '../../src/components/StepIndicator';

describe('StepIndicator', () => {
  const steps = [
    { id: 1, label: 'Digital Twin', disabled: false },
    { id: 2, label: 'Solar', disabled: false },
    { id: 3, label: 'Batteries & Tariffs', disabled: true },
    { id: 4, label: 'Finance', disabled: false }
  ];

  it('renders all 4 step labels', () => {
    render(<StepIndicator steps={steps} currentStep={1} completedSteps={new Set()} />);

    expect(screen.getByText('Digital Twin')).toBeInTheDocument();
    expect(screen.getByText('Solar')).toBeInTheDocument();
    expect(screen.getByText('Batteries & Tariffs')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
  });

  it('shows Coming Soon badge for disabled steps', () => {
    render(<StepIndicator steps={steps} currentStep={1} completedSteps={new Set()} />);

    // Disabled step adds a "Coming Soon" marker next to its label
    expect(screen.getByText(/Coming Soon/i)).toBeInTheDocument();
  });

  it('marks completed steps with completed styling', () => {
    const completedSteps = new Set<number>([1, 2]);
    const { container } = render(<StepIndicator steps={steps} currentStep={3} completedSteps={completedSteps} />);

    // Completed steps use the "bg-indigo-600" class.
    expect(container.querySelectorAll('.bg-indigo-600').length).toBeGreaterThanOrEqual(2);
  });

  it('uses a 4-column grid layout', () => {
    const { container } = render(<StepIndicator steps={steps} currentStep={1} completedSteps={new Set()} />);

    const gridContainer = container.querySelector('ol.grid');
    expect(gridContainer).toHaveClass('grid-cols-4');
  });
});
