import React from 'react'
import { motion } from 'framer-motion'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = '',
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 ${className}`}
    >
      {children}
    </motion.div>
  )
}

