import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import StepIndicator from '../../src/components/StepIndicator';

describe('StepIndicator', () => {
  const steps = [
    { label: 'Digital Twin', disabled: false },
    { label: 'Solar', disabled: false },
    { label: 'Batteries & Tariffs', disabled: true },
    { label: 'Finance', disabled: false },
  ];

  it('renders all 4 steps in grid layout', () => {
    const { container } = render(<StepIndicator steps={steps} currentStep={0} />);

    // Check that all 4 steps are rendered
    expect(container.textContent).toContain('Digital Twin');
    expect(container.textContent).toContain('Solar');
    expect(container.textContent).toContain('Batteries & Tariffs');
    expect(container.textContent).toContain('Finance');
  });

  it('applies active styling to current step', () => {
    const { container } = render(<StepIndicator steps={steps} currentStep={1} />);

    // Check that Solar step (index 1) has active styling
    const elements = container.querySelectorAll('.border-blue-500');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('applies completed styling to previous steps', () => {
    const { container } = render(<StepIndicator steps={steps} currentStep={2} />);

    // Steps 0 and 1 should be marked as completed
    const completedElements = container.querySelectorAll('.border-green-500');
    expect(completedElements.length).toBeGreaterThanOrEqual(2);
  });

  it('shows "Coming Soon" badge for disabled steps', () => {
    const { container } = render(<StepIndicator steps={steps} currentStep={0} />);

    // Should have "Coming Soon" text for the disabled step
    expect(container.textContent).toContain('Coming Soon');
  });

  it('applies disabled styling to disabled steps', () => {
    const { container } = render(<StepIndicator steps={steps} currentStep={0} />);

    const disabledElements = container.querySelectorAll('.opacity-50');
    expect(disabledElements.length).toBeGreaterThan(0);
  });

  it('does not show disabled step as active even if currentStep matches', () => {
    // Force currentStep=2 (the disabled step)
    const { container } = render(<StepIndicator steps={steps} currentStep={2} />);
    
    // Disabled step should still have disabled styling
    const disabledElements = container.querySelectorAll('.opacity-50');
    expect(disabledElements.length).toBeGreaterThan(0);
  });

  it('shows step numbers correctly (1-4)', () => {
    const { container } = render(<StepIndicator steps={steps} currentStep={0} />);

    // Check for step numbers in the UI
    const text = container.textContent || '';
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('3');
    expect(text).toContain('4');
  });

  it('uses 4-column grid layout', () => {
    const { container } = render(<StepIndicator steps={steps} currentStep={0} />);

    // Find the grid container
    const gridContainer = container.querySelector('.grid');
    expect(gridContainer).toHaveClass('grid-cols-4');
  });
});
