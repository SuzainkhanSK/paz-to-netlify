import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X, Wrench, RefreshCw, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { emergencyPointsFix } from '../utils/pointsInvestigation'
import toast from 'react-hot-toast'

const EmergencyPointsAlert: React.FC = () => {
  const { user, userProfile, refreshProfile } = useAuth()
  const [showAlert, setShowAlert] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [hasPointsIssue, setHasPointsIssue] = useState(false)
  const [expectedPoints, setExpectedPoints] = useState(0)

  useEffect(() => {
    if (user?.id && userProfile && isSupabaseConfigured) {
      checkUserPoints()
    }
  }, [user, userProfile])

  const checkUserPoints = async () => {
    if (!user?.id || !userProfile || !isSupabaseConfigured) return

    try {
      // Get user's transaction history
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)

      if (error) throw error

      // Calculate what points should be
      const earnedPoints = transactions
        .filter(t => t.type === 'earn')
        .reduce((sum, t) => sum + t.points, 0)
      
      const redeemedPoints = transactions
        .filter(t => t.type === 'redeem')
        .reduce((sum, t) => sum + t.points, 0)

      const correctPoints = Math.max(0, earnedPoints - redeemedPoints)
      setExpectedPoints(correctPoints)

      // Check if there's a significant discrepancy (more than 10 points)
      const discrepancy = Math.abs(userProfile.points - correctPoints)
      
      if (discrepancy > 10) {
        setHasPointsIssue(true)
        setShowAlert(true)
      }

    } catch (error) {
      console.warn('Failed to check user points:', error)
    }
  }

  const fixMyPoints = async () => {
    if (!user?.id) return

    setFixing(true)
    try {
      // Use the fixed database function
      const { data, error } = await supabase.rpc('recalculate_user_points', {
        user_id_param: user.id
      })
      
      if (error) throw error
      
      const result = Array.isArray(data) ? data[0] : data
      if (result && result.fixed) {
        toast.success(`✅ Points safely updated from ${result.old_points} to ${result.new_points}!`)
      } else {
        toast.success('✅ Your points are already correct!')
      }
      
      await refreshProfile()
      setShowAlert(false)
      setHasPointsIssue(false)

    } catch (error: any) {
      console.error('Points fix error:', error)
      toast.error(`Failed to fix points: ${error.message}. Please contact support.`)
    } finally {
      setFixing(false)
    }
  }

  if (!hasPointsIssue || !showAlert) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-4 left-4 right-4 z-50 max-w-2xl mx-auto"
      >
        <div className="bg-red-500/20 backdrop-blur-sm rounded-2xl p-6 border border-red-500/30 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-red-500/30 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            
            <div className="flex-1">
              <h3 className="text-red-300 font-bold text-lg mb-2">
                🚨 Points Issue Detected
              </h3>
              <p className="text-red-200 text-sm mb-4">
                We detected that your points balance ({userProfile?.points || 0}) doesn't match your 
                transaction history (expected: {expectedPoints}). This might be due to a system error.
              </p>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={fixMyPoints}
                  disabled={fixing}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/30 hover:bg-red-500/40 border border-red-400/50 rounded-lg text-red-200 font-medium transition-colors disabled:opacity-50"
                >
                  {fixing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wrench className="h-4 w-4" />
                  )}
                  {fixing ? 'Fixing...' : 'Safely Fix My Points'}
                </button>
                
                <button
                  onClick={() => setShowAlert(false)}
                  className="text-red-300 hover:text-red-200 text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
            
            <button
              onClick={() => setShowAlert(false)}
              className="text-red-400 hover:text-red-300 flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default EmergencyPointsAlert