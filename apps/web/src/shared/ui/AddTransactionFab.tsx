import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export function AddTransactionFab() {
  const navigate = useNavigate();

  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.05 }}
      onClick={() => navigate('/transactions/add')}
      className="fixed bottom-24 right-4 w-14 h-14 text-white rounded-2xl flex items-center justify-center text-2xl z-40 haptic"
      style={{
        background: 'linear-gradient(135deg, #FF6B35, #FF8C42)',
        boxShadow: '0 4px 20px rgba(255, 107, 53, 0.45)',
      }}
    >
      +
    </motion.button>
  );
}
