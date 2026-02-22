/**
 * Upload Wizard Component - Step-by-step progress indicator
 */
import React from 'react';
import './UploadWizard.css';

interface Step {
  id: string;
  label: string;
  description?: string;
}

interface UploadWizardProps {
  currentStep: number;
  steps: Step[];
  datasetName?: string;
}

const UploadWizard = ({ currentStep, steps, datasetName }: UploadWizardProps) => {
  return (
    <div className="upload-wizard">
      {datasetName && (
        <div className="wizard-header">
          <h2>{datasetName}</h2>
        </div>
      )}
      <div className="wizard-steps">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = stepNumber < currentStep;
          const isUpcoming = stepNumber > currentStep;

          return (
            <React.Fragment key={step.id}>
              <div
                className={`wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isUpcoming ? 'upcoming' : ''}`}
              >
                <div className="step-indicator">
                  <div className="step-number">
                    {isCompleted ? (
                      <span className="step-check">✓</span>
                    ) : (
                      <span>{stepNumber}</span>
                    )}
                  </div>
                </div>
                <div className="step-content">
                  <div className="step-label">{step.label}</div>
                  {step.description && (
                    <div className="step-description">{step.description}</div>
                  )}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`step-connector ${isCompleted ? 'completed' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default UploadWizard;
