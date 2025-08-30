import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { pointsProtection } from '../utils/pointsProtection'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

interface PointsMonitorState {
  isMonitoring: boolean
  suspiciousActivity: boolean
  issues: string[]
  lastCheck: Date | null
  pointsHistory: Array<{
    timestamp: Date
    points: number
    change: number
    reason: string
  }>
}

export const usePointsMonitor = () => {
  const { user, userProfile } = useAuth()
  const [monitorState, setMonitorState] = useState<PointsMonitorState>({
    isMonitoring: false,
    suspiciousActivity: false,
    issues: [],
    lastCheck: null,
    pointsHistory: []
  })

  const checkPoints = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) return

    try {
      const result = await pointsProtection.monitorPointsChanges(user.id)
      
      setMonitorState(prev => ({
        ...prev,
        suspiciousActivity: result.suspiciousActivity,
        issues: result.issues,
        lastCheck: new Date()
      }))

      // Get recent points history
      try {
        const { data: auditLog, error } = await supabase
          .from('points_audit_log')
          .select('*')
          .eq('user_id', user.id)
          .order('changed_at', { ascending: false })
          .limit(10)

        if (!error && auditLog) {
          const history = auditLog.map(entry => ({
            timestamp: new Date(entry.changed_at),
            points: entry.new_points,
            change: entry.new_points - entry.old_points,
            reason: entry.reason || 'Unknown'
          }))
          
          setMonitorState(prev => ({
            ...prev,
            pointsHistory: history
          }))
        }
      } catch (auditError) {
        // If points_audit_log doesn't exist, use transaction history as fallback
        console.warn('Points audit log not available, using transaction history:', auditError)
        
        const { data: transactions, error: transError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10)

        if (!transError && transactions) {
          const history = transactions.map(transaction => ({
            timestamp: new Date(transaction.created_at),
            points: transaction.points,
            change: transaction.type === 'earn' ? transaction.points : -transaction.points,
            reason: transaction.description || 'Transaction'
          }))
          
          setMonitorState(prev => ({
            ...prev,
            pointsHistory: history
          }))
        }
      }

    } catch (error) {
      console.warn('Points monitoring failed:', error)
    }
  }, [user?.id])

  const startMonitoring = useCallback(() => {
    if (!user?.id) return

    setMonitorState(prev => ({ ...prev, isMonitoring: true }))
    
    // Initial check
    checkPoints()
    
    // Check every 5 minutes
    const interval = setInterval(checkPoints, 5 * 60 * 1000)
    
    return () => {
      clearInterval(interval)
      setMonitorState(prev => ({ ...prev, isMonitoring: false }))
    }
  }, [user?.id, checkPoints])

  const stopMonitoring = useCallback(() => {
    setMonitorState(prev => ({ ...prev, isMonitoring: false }))
  }, [])

  // Auto-start monitoring when user logs in
  useEffect(() => {
    if (user?.id && userProfile) {
      const cleanup = startMonitoring()
      return cleanup
    }
  }, [user?.id, userProfile, startMonitoring])

  return {
    ...monitorState,
    checkPoints,
    startMonitoring,
    stopMonitoring
  }
}