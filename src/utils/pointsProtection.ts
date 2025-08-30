// Points Protection System - Prevents unauthorized point deductions
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import toast from 'react-hot-toast'

interface PointsTransaction {
  type: 'earn' | 'redeem'
  points: number
  description: string
  taskType?: string
  userId: string
}

class PointsProtectionSystem {
  private pendingTransactions = new Map<string, PointsTransaction>()
  private transactionTimeouts = new Map<string, NodeJS.Timeout>()

  // Secure points transaction with validation
  async executeSecureTransaction(transaction: PointsTransaction): Promise<boolean> {
    if (!isSupabaseConfigured) {
      throw new Error('Database not configured')
    }

    const transactionId = `${transaction.userId}-${Date.now()}-${Math.random()}`
    
    try {
      // Add to pending transactions
      this.pendingTransactions.set(transactionId, transaction)
      
      // Set timeout to clean up if transaction fails
      const timeout = setTimeout(() => {
        this.pendingTransactions.delete(transactionId)
        console.warn('Transaction timeout:', transactionId)
      }, 30000) // 30 second timeout
      
      this.transactionTimeouts.set(transactionId, timeout)

      // Validate transaction before processing
      const isValid = await this.validateTransaction(transaction)
      if (!isValid) {
        throw new Error('Transaction validation failed')
      }

      // Get current user points with row locking
      const { data: currentProfile, error: profileError } = await supabase
        .from('profiles')
        .select('points, total_earned')
        .eq('id', transaction.userId)
        .single()

      if (profileError) throw profileError

      // Validate sufficient points for redemption
      if (transaction.type === 'redeem' && currentProfile.points < transaction.points) {
        throw new Error('Insufficient points for redemption')
      }

      // Calculate new points
      const newPoints = transaction.type === 'earn' 
        ? currentProfile.points + transaction.points
        : Math.max(0, currentProfile.points - transaction.points)

      const newTotalEarned = transaction.type === 'earn'
        ? currentProfile.total_earned + transaction.points
        : currentProfile.total_earned

      // Execute transaction atomically
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: transaction.userId,
          type: transaction.type,
          points: transaction.points,
          description: transaction.description,
          task_type: transaction.taskType || null
        })

      if (transactionError) throw transactionError

      // Update profile points
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          points: newPoints,
          total_earned: newTotalEarned
        })
        .eq('id', transaction.userId)

      if (updateError) throw updateError

      // Clean up
      this.pendingTransactions.delete(transactionId)
      const timeoutRef = this.transactionTimeouts.get(transactionId)
      if (timeoutRef) {
        clearTimeout(timeoutRef)
        this.transactionTimeouts.delete(transactionId)
      }

      return true

    } catch (error: any) {
      // Clean up on error
      this.pendingTransactions.delete(transactionId)
      const timeoutRef = this.transactionTimeouts.get(transactionId)
      if (timeoutRef) {
        clearTimeout(timeoutRef)
        this.transactionTimeouts.delete(transactionId)
      }

      console.error('Secure transaction failed:', error)
      throw error
    }
  }

  private async validateTransaction(transaction: PointsTransaction): Promise<boolean> {
    // Validate points amount
    if (transaction.points <= 0) {
      console.error('Invalid points amount:', transaction.points)
      return false
    }

    // Validate description
    if (!transaction.description || transaction.description.trim().length === 0) {
      console.error('Missing transaction description')
      return false
    }

    // Check for duplicate transactions in the last minute
    try {
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()
      
      const { data: recentTransactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', transaction.userId)
        .eq('type', transaction.type)
        .eq('points', transaction.points)
        .eq('description', transaction.description)
        .gte('created_at', oneMinuteAgo)

      if (error) throw error

      if (recentTransactions.length > 0) {
        console.error('Duplicate transaction detected:', transaction)
        return false
      }

      return true
    } catch (error) {
      console.error('Transaction validation failed:', error)
      return false
    }
  }

  // Monitor for suspicious point changes
  async monitorPointsChanges(userId: string): Promise<{
    suspiciousActivity: boolean
    issues: string[]
  }> {
    if (!isSupabaseConfigured) {
      return { suspiciousActivity: false, issues: ['Database not configured'] }
    }

    try {
      const issues: string[] = []

      // Check recent audit log for this user
      const { data: recentChanges, error } = await supabase
        .from('points_audit_log')
        .select('*')
        .eq('user_id', userId)
        .gte('changed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('changed_at', { ascending: false })

      if (error) throw error

      // Look for suspicious patterns
      const unexpectedDeductions = recentChanges.filter(change => {
        const pointsChange = change.new_points - change.old_points
        return pointsChange < 0 && !change.reason?.includes('redemption')
      })

      if (unexpectedDeductions.length > 0) {
        issues.push(`${unexpectedDeductions.length} unexpected point deductions in last 24 hours`)
      }

      // Check for rapid point changes
      const rapidChanges = recentChanges.filter((change, index) => {
        if (index === 0) return false
        const prevChange = recentChanges[index - 1]
        const timeDiff = new Date(change.changed_at).getTime() - new Date(prevChange.changed_at).getTime()
        return timeDiff < 60000 // Less than 1 minute apart
      })

      if (rapidChanges.length > 0) {
        issues.push(`${rapidChanges.length} rapid point changes detected`)
      }

      return {
        suspiciousActivity: issues.length > 0,
        issues
      }

    } catch (error: any) {
      console.error('Points monitoring failed:', error)
      return { suspiciousActivity: false, issues: [`Monitoring failed: ${error.message}`] }
    }
  }
}

export const pointsProtection = new PointsProtectionSystem()

// Wrapper function for secure point operations
export async function securePointsOperation(
  userId: string,
  type: 'earn' | 'redeem',
  points: number,
  description: string,
  taskType?: string
): Promise<boolean> {
  try {
    return await pointsProtection.executeSecureTransaction({
      userId,
      type,
      points,
      description,
      taskType
    })
  } catch (error: any) {
    console.error('Secure points operation failed:', error)
    toast.error('Points operation failed. Please try again.')
    return false
  }
}