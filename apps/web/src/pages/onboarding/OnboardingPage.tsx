import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store';
import { apiClient } from '@/shared/api/client';
import type { OnboardingGoalType, OnboardingData } from '@finwise/shared-types';

// Step components
import { StepWelcome } from './steps/StepWelcome';
import { StepGoal } from './steps/StepGoal';
import { StepIncome } from './steps/StepIncome';
import { StepBank } from './steps/StepBank';
import { StepFirstTransaction } from './steps/StepFirstTransaction';
import { StepReady } from './steps/StepReady';

const TOTAL_STEPS = 6;

export function OnboardingPage() {
  const navigate = useNavigate();
  const { setOnboardingCompleted } = useAuthStore();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<OnboardingData>>({});
  const [isLoading, setIsLoading] = useState(false);

  const updateData = (patch: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const finish = async () => {
    setIsLoading(true);
    try {
      await apiClient.post('/onboarding/complete', data);
      setOnboardingCompleted(true);
      navigate('/');
    } catch {
      // Still navigate even if API fails
      setOnboardingCompleted(true);
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const stepProps = { data, updateData, onNext: next, onBack: back, onFinish: finish, isLoading };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-b from-blue-50 to-white flex flex-col">
      {/* Progress bar */}
      {step > 1 && (
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={back} className="text-gray-400 text-sm haptic">← Назад</button>
            <div className="flex-1" />
            <span className="text-gray-400 text-sm">{step}/{TOTAL_STEPS}</span>
          </div>
          <div className="progress-bar">
            <motion.div
              className="progress-bar-fill bg-blue-500"
              animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
            className="min-h-full flex flex-col"
          >
            {step === 1 && <StepWelcome {...stepProps} />}
            {step === 2 && <StepGoal {...stepProps} />}
            {step === 3 && <StepIncome {...stepProps} />}
            {step === 4 && <StepBank {...stepProps} />}
            {step === 5 && <StepFirstTransaction {...stepProps} />}
            {step === 6 && <StepReady {...stepProps} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
