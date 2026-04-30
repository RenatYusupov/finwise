import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export function AddTransactionFab() {
  const navigate = useNavigate();

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => navigate('/transactions/add')}
      className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40 haptic"
      style={{ boxShadow: '0 4px 20px rgba(45, 125, 210, 0.4)' }}
    >
      +
    </motion.button>
  );
}
