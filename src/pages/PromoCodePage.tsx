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
  Check,
  MessageCircle,
  ExternalLink
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import toast from 'react-hot-toast'
import Confetti from 'react-confetti'

interface PromoCodeRedemption {
  id: string
  user_id: string
  promo_code_id: string
  points_earned: number
  created_at: string
  promo_codes?: {
    code: string
    description?: string
  }
}

const PromoCodePage: React.FC = () => {
  const { user, userProfile, refreshProfile } = useAuth()
  const [promoCode, setPromoCode] = useState('')
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [redemptions, setRedemptions] = useState<PromoCodeRedemption[]>([])
  const [loading, setLoading] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  })

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (user?.id && isSupabaseConfigured) {
      fetchRedemptionHistory()
    }
  }, [user])

  const fetchRedemptionHistory = async () => {
    if (!user?.id || !isSupabaseConfigured) return

    try {
      setLoading(true)
      
      const { data, error } = await supabase.rpc('get_user_redemptions', { 
        user_id_param: user.id 
      })

      if (error) throw error
      
      setRedemptions(data || [])
    } catch (error) {
      console.error('Failed to fetch redemption history:', error)
      toast.error('Failed to load redemption history')
    } finally {
      setLoading(false)
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
      // Use the fixed promo code redemption function
      const { data, error } = await supabase.rpc('redeem_promo_code', {
        code_param: promoCode.trim().toUpperCase(),
        user_id_param: user.id
      })

      if (error) throw error

      if (data && data.length > 0) {
        const result = data[0] // Get first row from the table result
        if (result.success) {
          // Show success message
          toast.success(`🎉 ${result.message}! You earned ${result.points} points!`)
        
          // Show confetti animation
          setShowConfetti(true)
          setTimeout(() => setShowConfetti(false), 5000)
        
          // Clear input
          setPromoCode('')
        
          // Force refresh profile and redemption history with retry logic
          try {
            await refreshProfile()
            // Wait a moment for database consistency
            await new Promise(resolve => setTimeout(resolve, 1000))
            await fetchRedemptionHistory()
            
            // Force a second refresh to ensure UI is updated
            setTimeout(async () => {
              await refreshProfile()
            }, 2000)
          } catch (refreshError) {
            console.warn('Profile refresh failed, retrying...', refreshError)
            // Retry refresh after a delay
            setTimeout(async () => {
              try {
                await refreshProfile()
                await fetchRedemptionHistory()
              } catch (retryError) {
                console.error('Retry refresh failed:', retryError)
              }
            }, 3000)
          }
        } else {
          // Show error message
          toast.error(result.message || 'Failed to redeem code')
        }
      } else {
        toast.error('No response from server')
      }
    } catch (error: any) {
      console.error('Promo code redemption error:', error)
      
      // User-friendly error messages
      if (error.message?.includes('not found')) {
        toast.error('Invalid promo code. Please check and try again.')
      } else if (error.message?.includes('already redeemed')) {
        toast.error('You have already redeemed this code.')
      } else if (error.message?.includes('expired')) {
        toast.error('This promo code has expired.')
      } else if (error.message?.includes('maximum uses')) {
        toast.error('This promo code has reached its maximum number of uses.')
      } else {
        toast.error(error.message || 'Failed to redeem promo code. Please try again.')
      }
    } finally {
      setIsRedeeming(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(text)
      toast.success('Copied to clipboard!')
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Confetti Animation */}
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={500}
        />
      )}
      
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
            Promo Codes
          </span>
        </h1>
        <p className="text-xl text-gray-300 mb-6">
          Redeem exclusive promo codes from our Telegram channel for bonus points!
        </p>
      </motion.div>

      {/* Redemption Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-purple-500/20 to-pink-600/20 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 relative overflow-hidden"
      >
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div 
            className="absolute top-10 left-10 w-32 h-32 bg-purple-400/10 rounded-full blur-xl"
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div 
            className="absolute bottom-10 right-20 w-40 h-40 bg-pink-500/10 rounded-full blur-xl"
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1
            }}
          />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <Ticket className="h-6 w-6 text-purple-400" />
                Redeem Promo Code
              </h2>
              
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full max-w-md">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Enter promo code"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:border-transparent uppercase text-lg font-mono tracking-wider"
                    disabled={isRedeeming}
                  />
                </div>
                
                <motion.button
                  onClick={handleRedeemCode}
                  disabled={isRedeeming || !promoCode.trim()}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  {isRedeeming ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Gift className="h-5 w-5" />
                      Redeem Code
                    </>
                  )}
                </motion.button>
              </div>
            </div>
            
            <div className="bg-black/30 p-6 rounded-xl border border-purple-400/30 flex-shrink-0 text-center">
              <h3 className="text-lg font-bold text-white mb-3">Your Balance</h3>
              <div className="flex items-center justify-center gap-2 text-2xl font-bold text-purple-400 mb-2">
                <Coins className="h-6 w-6" />
                <span>{userProfile?.points || 0}</span>
              </div>
              <p className="text-gray-300 text-sm">Available Points</p>
            </div>
          </div>

          {/* Telegram Channel Info */}
          <div className="bg-blue-500/20 rounded-xl p-6 border border-blue-400/30 mb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-10 w-10 text-blue-400" />
                <div>
                  <h3 className="text-white font-bold text-lg">Join Our Telegram Channel</h3>
                  <p className="text-gray-300">Get daily promo codes and exclusive offers</p>
                </div>
              </div>
              
              <a 
                href="https://t.me/PremiumAccessZoneOfficial" 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-auto px-4 py-2 bg-blue-500/30 hover:bg-blue-500/40 border border-blue-400/50 rounded-lg text-blue-300 transition-colors flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Join Now
              </a>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white/10 rounded-xl p-6 border border-white/20">
            <h3 className="text-lg font-bold text-white mb-4">How It Works</h3>
            <ol className="space-y-3 list-decimal list-inside text-gray-300">
              <li>Join our Telegram channel <span className="text-blue-400">@PremiumAccessZoneOfficial</span></li>
              <li>Look for daily promo code posts</li>
              <li>Enter the code above and click "Redeem Code"</li>
              <li>Instantly receive bonus points in your account</li>
            </ol>
            <div className="mt-4 text-sm text-yellow-300">
              <strong>Pro Tip:</strong> Turn on Telegram notifications to never miss a code!
            </div>
          </div>
        </div>
      </motion.div>

      {/* Redemption History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Clock className="h-6 w-6 text-blue-400" />
            Redemption History
          </h2>
          
          <button
            onClick={fetchRedemptionHistory}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400" />
          </div>
        ) : redemptions.length > 0 ? (
          <div className="space-y-4">
            {redemptions.map((redemption) => (
              <motion.div
                key={redemption.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/10 rounded-xl p-4 border border-white/20 hover:bg-white/15 transition-all duration-300"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center">
                      <Ticket className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-mono font-medium">
                          {redemption.code || 'N/A'}
                        </p>
                        <button
                          onClick={() => copyToClipboard(redemption.code || '')}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          {copiedCode === redemption.code ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-gray-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-gray-400 text-sm">
                        {formatDate(redemption.created_at)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-full">
                    <Coins className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 font-bold">+{redemption.points_earned}</span>
                  </div>
                </div>
                
                {redemption.description && (
                  <div className="mt-3 ml-13 pl-13 text-gray-300 text-sm border-t border-white/10 pt-2">
                    {redemption.description}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Ticket className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Redemptions Yet</h3>
            <p className="text-gray-400 mb-6">
              Redeem your first promo code to see your history here
            </p>
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default PromoCodePage