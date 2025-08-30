import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Ticket, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Gift, 
  Sparkles,
  Coins,
  Copy,
  Check
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import toast from 'react-hot-toast'

interface PromoCodeRedemption {
  id: string
  promo_code_id: string
  points_earned: number
  created_at: string
  promo_codes?: {
    code: string
    description?: string
  }
}

const PromoCodeRedemption: React.FC = () => {
  const { user, userProfile, refreshProfile } = useAuth()
  const [promoCode, setPromoCode] = useState('')
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [recentRedemptions, setRecentRedemptions] = useState<PromoCodeRedemption[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  useEffect(() => {
    if (user?.id && isSupabaseConfigured) {
      fetchRecentRedemptions()
    }
  }, [user])

  const fetchRecentRedemptions = async () => {
    if (!user?.id || !isSupabaseConfigured) return

    try {
      setHistoryLoading(true)
      const { data, error } = await supabase
        .rpc('get_user_redemptions', { user_id_param: user.id })

      if (error) throw error
      
      // Take only the first 5 for recent redemptions
      setRecentRedemptions((data || []).slice(0, 5))
    } catch (error) {
      console.error('Failed to fetch redemption history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleRedeemCode = async () => {
    if (!promoCode.trim()) {
      toast.error('Please enter a promo code')
      return
    }

    if (!user?.id) {
      toast.error('You must be logged in to redeem promo codes')
      return
    }

    if (!isSupabaseConfigured) {
      toast.error('Database not configured. Please connect to Supabase first.')
      return
    }

    setIsRedeeming(true)

    try {
      const { data, error } = await supabase.rpc('redeem_promo_code', {
        code_param: promoCode.trim(),
        user_id_param: user.id
      })

      if (error) throw error

      if (data.success) {
        // Show success message
        toast.success(`🎉 ${data.message}! You earned ${data.points} points!`)
        
        // Show confetti animation
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 3000)
        
        // Clear input
        setPromoCode('')
        
        // Refresh profile and redemption history
        await Promise.all([
          refreshProfile(),
          fetchRecentRedemptions()
        ])
      } else {
        // Show error message
        toast.error(data.message)
      }
    } catch (error: any) {
      console.error('Promo code redemption error:', error)
      toast.error(error.message || 'Failed to redeem promo code. Please try again.')
    } finally {
      setIsRedeeming(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(true)
      toast.success('Copied to clipboard!')
      setTimeout(() => setCopiedCode(false), 2000)
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    }
  }

  // Confetti animation
  const renderConfetti = () => {
    if (!showConfetti) return null;
    
    return (
      <div className="absolute inset-0 pointer-events-none z-10">
        {Array.from({ length: 50 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            initial={{ 
              top: "50%", 
              left: "50%",
              scale: 0,
              opacity: 1,
              backgroundColor: ['#FFD700', '#FF6347', '#4169E1', '#32CD32', '#FF69B4', '#9370DB'][Math.floor(Math.random() * 6)]
            }}
            animate={{ 
              top: `${Math.random() * 100}%`, 
              left: `${Math.random() * 100}%`,
              scale: Math.random() * 2 + 1,
              opacity: 0
            }}
            transition={{ 
              duration: Math.random() * 2 + 1,
              ease: "easeOut"
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="relative bg-gradient-to-br from-purple-500/20 to-pink-600/20 backdrop-blur-sm rounded-xl p-3 border border-purple-500/30 overflow-hidden">
      {renderConfetti()}
      
      <div className="flex items-center gap-2 mb-2">
        <Ticket className="h-5 w-5 text-purple-400" />
        <h3 className="text-white font-semibold text-sm">Promo Code</h3>
      </div>
      
      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Enter promo code"
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:border-transparent uppercase text-sm"
            disabled={isRedeeming}
          />
          
          <motion.button
            onClick={handleRedeemCode}
            disabled={isRedeeming || !promoCode.trim()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="absolute right-1 top-1 px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs"
          >
            {isRedeeming ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              'Redeem'
            )}
          </motion.button>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-gray-300">
            <Gift className="h-3 w-3 text-purple-400 flex-shrink-0" />
            <span>Daily codes on Telegram</span>
          </div>
          
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 flex-shrink-0"
          >
            <Clock className="h-3 w-3" />
            {showHistory ? 'Hide' : 'Show'} History
          </button>
        </div>
      </div>
      
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 pt-2 border-t border-white/10"
          >
            <h4 className="text-xs font-medium text-white mb-2">Recent Redemptions</h4>
            
            {historyLoading ? (
              <div className="flex items-center justify-center py-2">
                <RefreshCw className="h-4 w-4 text-purple-400 animate-spin" />
              </div>
            ) : recentRedemptions.length > 0 ? (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {recentRedemptions.map((redemption) => (
                  <div 
                    key={redemption.id}
                    className="flex items-center justify-between p-1.5 bg-white/10 rounded text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Ticket className="h-3 w-3 text-purple-400" />
                        <span className="text-white font-mono">
                          {redemption.code || 'N/A'}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(redemption.code || '')}
                        className="p-0.5 hover:bg-white/10 rounded transition-colors"
                      >
                        {copiedCode ? (
                          <Check className="h-2.5 w-2.5 text-green-400" />
                        ) : (
                          <Copy className="h-2.5 w-2.5 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 text-green-400">
                      <Coins className="h-2.5 w-2.5" />
                      <span>+{redemption.points_earned}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-1 text-gray-400 text-xs">
                No redemptions yet
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default PromoCodeRedemption