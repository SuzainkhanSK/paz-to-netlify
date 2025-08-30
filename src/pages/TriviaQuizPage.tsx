import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Award, 
  Zap, 
  Trophy, 
  History,
  Info,
  RefreshCw,
  Star,
  ArrowRight,
  Coins,
  AlertCircle
} from 'lucide-react'
import ReactConfetti from 'react-confetti'
import { useAuth } from '../contexts/AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import toast from 'react-hot-toast'

// Import custom icon components
import Globe from '../components/Globe'
import Tv from '../components/Tv'
import Play from '../components/Play'

interface Question {
  id: string
  text: string
  options: string[]
  correctAnswer: number
}

interface QuizCategory {
  id: string
  name: string
  icon: React.ComponentType<any>
  color: string
  apiCategory?: number
}

interface QuizDifficulty {
  id: string
  name: string
  pointsPerQuestion: number
  color: string
  icon: string
}

interface QuizResult {
  score: number
  totalQuestions: number
  correctAnswers: number
  timeTaken: number
  category: string
  difficulty: string
}

interface QuizHistory {
  id: string
  user_id: string
  score: number
  total_questions: number
  correct_answers: number
  time_taken: number
  category?: string
  difficulty?: string
  created_at: string
}

interface TriviaAPIResponse {
  response_code: number
  results: {
    category: string
    type: string
    difficulty: string
    question: string
    correct_answer: string
    incorrect_answers: string[]
  }[]
}

const TriviaQuizPage: React.FC = () => {
  const { user, userProfile, refreshProfile } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null)
  const [quizStarted, setQuizStarted] = useState(false)
  const [quizFinished, setQuizFinished] = useState(false)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null)
  const [score, setScore] = useState(0)
  const [correctAnswers, setCorrectAnswers] = useState(0)
  const [timeLeft, setTimeLeft] = useState(15)
  const [quizStartTime, setQuizStartTime] = useState(0)
  const [quizEndTime, setQuizEndTime] = useState(0)
  const [quizHistory, setQuizHistory] = useState<QuizHistory[]>([])
  const [quizzesRemaining, setQuizzesRemaining] = useState(3)
  const [loading, setLoading] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [showTutorial, setShowTutorial] = useState(false)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Quiz categories mapped to Open Trivia DB API categories
  const categories: QuizCategory[] = [
    { id: 'all', name: 'All Categories', icon: Globe, color: 'from-blue-400 to-blue-600' },
    { id: 'general', name: 'General Knowledge', icon: Globe, color: 'from-purple-400 to-purple-600', apiCategory: 9 },
    { id: 'science', name: 'Science & Nature', icon: Zap, color: 'from-green-400 to-green-600', apiCategory: 17 },
    { id: 'science_computer', name: 'Science: Computers', icon: Zap, color: 'from-cyan-400 to-cyan-600', apiCategory: 18 },
    { id: 'history', name: 'History', icon: Clock, color: 'from-yellow-400 to-yellow-600', apiCategory: 23 },
    { id: 'geography', name: 'Geography', icon: Globe, color: 'from-blue-400 to-blue-600', apiCategory: 22 },
    { id: 'entertainment', name: 'Entertainment: Film', icon: Tv, color: 'from-pink-400 to-pink-600', apiCategory: 11 },
    { id: 'sports', name: 'Sports', icon: Trophy, color: 'from-orange-400 to-orange-600', apiCategory: 21 },
    { id: 'music', name: 'Entertainment: Music', icon: Tv, color: 'from-indigo-400 to-indigo-600', apiCategory: 12 }
  ]

  // Quiz difficulties
  const difficulties: QuizDifficulty[] = [
    { id: 'easy', name: 'Easy', pointsPerQuestion: 10, color: 'from-green-400 to-green-600', icon: '⭐' },
    { id: 'medium', name: 'Medium', pointsPerQuestion: 20, color: 'from-yellow-400 to-yellow-600', icon: '⭐⭐' },
    { id: 'hard', name: 'Hard', pointsPerQuestion: 30, color: 'from-red-400 to-red-600', icon: '⭐⭐⭐' }
  ]

  // Function to fetch questions from Open Trivia DB API
  const fetchQuestionsFromAPI = async (categoryId: string, difficulty: string, count: number = 10): Promise<Question[]> => {
    try {
      let allQuestions: Question[] = []
      
      if (categoryId === 'all') {
        // For 'all' category, fetch from multiple categories
        const selectedCategories = categories.filter(cat => cat.apiCategory && cat.id !== 'all')
        const questionsPerCategory = Math.ceil(count / selectedCategories.length)
        
        const promises = selectedCategories.map(async (category) => {
          try {
            const url = `https://opentdb.com/api.php?amount=${questionsPerCategory}&category=${category.apiCategory}&difficulty=${difficulty}&encode=url3986`
            const response = await fetch(url)
            const data: TriviaAPIResponse = await response.json()
            
            if (data.response_code === 0 && data.results) {
              return data.results.map((q, index) => {
                const options = [...q.incorrect_answers, q.correct_answer]
                  .map(opt => decodeURIComponent(opt))
                  .sort(() => Math.random() - 0.5)
                
                return {
                  id: `api_${category.id}_${difficulty}_${index}`,
                  text: decodeURIComponent(q.question),
                  options: options,
                  correctAnswer: options.indexOf(decodeURIComponent(q.correct_answer))
                }
              })
            }
            return []
          } catch (error) {
            console.error(`Error fetching from category ${category.id}:`, error)
            return []
          }
        })
        
        const results = await Promise.all(promises)
        allQuestions = results.flat()
      } else {
        // For specific category
        const category = categories.find(cat => cat.id === categoryId)
        if (!category?.apiCategory) {
          throw new Error(`Invalid category: ${categoryId}`)
        }
        
        // Fetch both multiple choice and boolean questions
        const multipleChoiceUrl = `https://opentdb.com/api.php?amount=${Math.ceil(count/2)}&category=${category.apiCategory}&difficulty=${difficulty}&type=multiple&encode=url3986`
        const booleanUrl = `https://opentdb.com/api.php?amount=${Math.floor(count/2)}&category=${category.apiCategory}&difficulty=${difficulty}&type=boolean&encode=url3986`
        
        const [multipleResponse, booleanResponse] = await Promise.all([
          fetch(multipleChoiceUrl),
          fetch(booleanUrl)
        ])
        
        const multipleData: TriviaAPIResponse = await multipleResponse.json()
        const booleanData: TriviaAPIResponse = await booleanResponse.json()
        
        // Process multiple choice questions
        if (multipleData.response_code === 0 && multipleData.results) {
          const multipleQuestions = multipleData.results.map((q, index) => {
            const options = [...q.incorrect_answers, q.correct_answer]
              .map(opt => decodeURIComponent(opt))
              .sort(() => Math.random() - 0.5)
            
            return {
              id: `api_multiple_${categoryId}_${difficulty}_${index}`,
              text: decodeURIComponent(q.question),
              options: options,
              correctAnswer: options.indexOf(decodeURIComponent(q.correct_answer))
            }
          })
          allQuestions = [...allQuestions, ...multipleQuestions]
        }
        
        // Process boolean questions
        if (booleanData.response_code === 0 && booleanData.results) {
          const booleanQuestions = booleanData.results.map((q, index) => {
            const options = ['True', 'False']
            const correctAnswer = decodeURIComponent(q.correct_answer)
            
            return {
              id: `api_boolean_${categoryId}_${difficulty}_${index}`,
              text: decodeURIComponent(q.question),
              options: options,
              correctAnswer: options.indexOf(correctAnswer)
            }
          })
          allQuestions = [...allQuestions, ...booleanQuestions]
        }
      }
      
      // If we don't have enough questions, try to fetch more from general knowledge
      if (allQuestions.length < count) {
        const remainingCount = count - allQuestions.length
        const generalUrl = `https://opentdb.com/api.php?amount=${remainingCount}&category=9&difficulty=${difficulty}&encode=url3986`
        
        try {
          const response = await fetch(generalUrl)
          const data: TriviaAPIResponse = await response.json()
          
          if (data.response_code === 0 && data.results) {
            const generalQuestions = data.results.map((q, index) => {
              const options = [...q.incorrect_answers, q.correct_answer]
                .map(opt => decodeURIComponent(opt))
                .sort(() => Math.random() - 0.5)
              
              return {
                id: `api_general_fallback_${index}`,
                text: decodeURIComponent(q.question),
                options: options,
                correctAnswer: options.indexOf(decodeURIComponent(q.correct_answer))
              }
            })
            allQuestions = [...allQuestions, ...generalQuestions]
          }
        } catch (error) {
          console.error('Error fetching fallback questions:', error)
        }
      }
      
      // Shuffle and return the requested number of questions
      const shuffled = allQuestions.sort(() => Math.random() - 0.5)
      return shuffled.slice(0, count)
      
    } catch (error) {
      console.error('Error fetching questions from API:', error)
      throw error
    }
  }

  // Function to decode HTML entities (keeping the existing one as fallback)
  const decodeHTMLEntities = (text: string): string => {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = text
    return textarea.value
  }

  useEffect(() => {
    if (user?.id) {
      fetchQuizHistory()
      checkDailyQuizzes()
    }
  }, [user])

  useEffect(() => {
    // Check if user is new and show tutorial
    const hasSeenTutorial = localStorage.getItem('triviaQuizTutorialSeen')
    if (!hasSeenTutorial) {
      setShowTutorial(true)
    }
  }, [])

  useEffect(() => {
    // Timer for quiz questions
    if (quizStarted && !quizFinished) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            // Time's up, move to next question
            handleNextQuestion()
            return 15
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [quizStarted, quizFinished, currentQuestionIndex])

  const fetchQuizHistory = async () => {
    if (!user?.id || !isSupabaseConfigured) return

    try {
      const { data, error } = await supabase
        .from('quiz_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setQuizHistory(data || [])
    } catch (error) {
      console.warn('Failed to fetch quiz history:', error)
    }
  }

  const checkDailyQuizzes = async () => {
    if (!user?.id || !isSupabaseConfigured) return

    try {
      const { data, error } = await supabase.rpc('check_daily_quiz_limit', {
        user_id_param: user.id
      })

      if (error) throw error
      setQuizzesRemaining(data || 0)
    } catch (error) {
      console.warn('Failed to check quiz limit:', error)
      
      // Fallback to localStorage
      const today = new Date().toDateString()
      const quizzesUsed = parseInt(localStorage.getItem(`quizzesUsed_${user.id}_${today}`) || '0')
      setQuizzesRemaining(Math.max(0, 3 - quizzesUsed))
    }
  }

  const getRandomQuestions = async (category: string, difficulty: string, count: number = 10): Promise<Question[]> => {
    try {
      return await fetchQuestionsFromAPI(category, difficulty, count)
    } catch (error) {
      console.error('Failed to fetch questions from API:', error)
      throw error
    }
  }

  const startQuiz = async () => {
    if (!selectedCategory || !selectedDifficulty) {
      toast.error('Please select a category and difficulty')
      return
    }

    if (quizzesRemaining <= 0) {
      toast.error('No quizzes remaining today!')
      return
    }

    setLoadingQuestions(true)
    
    try {
      // Get random questions from API
      const quizQuestions = await getRandomQuestions(selectedCategory, selectedDifficulty)
      
      if (quizQuestions.length === 0) {
        toast.error('No questions available for this category and difficulty. Please try different options.')
        setLoadingQuestions(false)
        return
      }

      setQuestions(quizQuestions)
      setCurrentQuestionIndex(0)
      setScore(0)
      setCorrectAnswers(0)
      setSelectedOption(null)
      setIsAnswerCorrect(null)
      setTimeLeft(15)
      setQuizStartTime(Date.now())
      setQuizStarted(true)
      setQuizFinished(false)
      
      toast.success(`Quiz started with ${quizQuestions.length} questions!`)
    } catch (error) {
      console.error('Error starting quiz:', error)
      toast.error('Failed to start quiz. Please check your internet connection and try again.')
    } finally {
      setLoadingQuestions(false)
    }
  }

  const handleAnswerSelection = (optionIndex: number) => {
    if (selectedOption !== null) return // Already answered
    
    setSelectedOption(optionIndex)
    
    const currentQuestion = questions[currentQuestionIndex]
    const isCorrect = optionIndex === currentQuestion.correctAnswer
    setIsAnswerCorrect(isCorrect)
    
    if (isCorrect) {
      const pointsPerQuestion = difficulties.find(d => d.id === selectedDifficulty)?.pointsPerQuestion || 10
      setScore(prev => prev + pointsPerQuestion)
      setCorrectAnswers(prev => prev + 1)
    }
    
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    
    // Auto-advance after 2 seconds
    setTimeout(() => {
      handleNextQuestion()
    }, 2000)
  }

  const handleNextQuestion = () => {
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
      setSelectedOption(null)
      setIsAnswerCorrect(null)
      setTimeLeft(15)
    } else {
      // End of quiz
      finishQuiz()
    }
  }

  const finishQuiz = async () => {
    setQuizFinished(true)
    setQuizEndTime(Date.now())
    
    const timeTaken = Math.floor((Date.now() - quizStartTime) / 1000)
    
    // Save quiz result
    if (user?.id && isSupabaseConfigured) {
      try {
        setLoading(true)
        
        const categoryName = categories.find(c => c.id === selectedCategory)?.name || ''
        const difficultyName = selectedDifficulty || ''
        
        const { data: quizResult, error } = await supabase.rpc('process_quiz_completion', {
          user_id_param: user.id,
          score_param: score,
          total_questions_param: questions.length,
          correct_answers_param: correctAnswers,
          time_taken_param: timeTaken,
          category_param: categoryName,
          difficulty_param: difficultyName
        })

        if (error) throw error
        
        if (!quizResult) {
          throw new Error('Quiz processing failed')
        }
        
        // Update local state
        const today = new Date().toDateString()
        const quizzesUsed = parseInt(localStorage.getItem(`quizzesUsed_${user.id}_${today}`) || '0') + 1
        localStorage.setItem(`quizzesUsed_${user.id}_${today}`, quizzesUsed.toString())
        
        setQuizzesRemaining(prev => Math.max(0, prev - 1))
        
        // Show confetti for good scores
        if (correctAnswers >= questions.length * 0.7) {
          setShowConfetti(true)
          setTimeout(() => setShowConfetti(false), 5000)
        }
        
        // Refresh profile and history
        await refreshProfile()
        await fetchQuizHistory()
        
        toast.success(`Quiz completed! You earned ${score} points!`)
      } catch (error) {
        console.error('Error saving quiz result:', error)
        toast.error('Failed to save quiz result')
      } finally {
        setLoading(false)
      }
    } else {
      // Offline mode or Supabase not configured
      toast.success(`Quiz completed! You scored ${correctAnswers} out of ${questions.length}!`)
    }
  }

  const resetQuiz = () => {
    setQuizStarted(false)
    setQuizFinished(false)
    setCurrentQuestionIndex(0)
    setSelectedOption(null)
    setIsAnswerCorrect(null)
    setScore(0)
    setCorrectAnswers(0)
    setTimeLeft(15)
    setQuestions([])
  }

  const getCategoryColor = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.color || 'from-blue-400 to-blue-600'
  }

  const getDifficultyColor = (difficultyId: string) => {
    return difficulties.find(d => d.id === difficultyId)?.color || 'from-blue-400 to-blue-600'
  }

  const getTimeUntilReset = () => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    
    const diff = tomorrow.getTime() - now.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Confetti Effect */}
      {showConfetti && (
        <ReactConfetti
          width={window.innerWidth}
          height={window.innerHeight}
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
          <span className="bg-gradient-to-r from-blue-400 via-cyan-500 to-teal-500 bg-clip-text text-transparent">
            Trivia Quiz
          </span>
        </h1>
        <p className="text-xl text-gray-300 mb-6">
          Test your knowledge with fresh questions from our trivia database!
        </p>
        
        {/* Quizzes Remaining */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-400" />
              <span className="text-white font-medium">
                {quizzesRemaining} quizzes remaining
              </span>
            </div>
            {quizzesRemaining === 0 && (
              <p className="text-gray-400 text-sm mt-1">
                Resets in {getTimeUntilReset()}
              </p>
            )}
          </div>
          
          <button
            onClick={() => setShowTutorial(true)}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 transition-colors"
          >
            <Info className="h-5 w-5 text-white" />
          </button>
        </div>
      </motion.div>

      {/* Quiz Setup or Quiz Content */}
      {!quizStarted ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20"
        >
          {/* Category Selection */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Select Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories.map(category => {
                const CategoryIcon = category.icon
                return (
                  <motion.button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`p-4 rounded-xl transition-all duration-300 ${
                      selectedCategory === category.id
                        ? `bg-gradient-to-br ${category.color} text-white`
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <CategoryIcon className="h-6 w-6" />
                      <span className="text-sm font-medium">{category.name}</span>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* Difficulty Selection */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Select Difficulty</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {difficulties.map(difficulty => (
                <motion.button
                  key={difficulty.id}
                  onClick={() => setSelectedDifficulty(difficulty.id)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-4 rounded-xl transition-all duration-300 ${
                    selectedDifficulty === difficulty.id
                      ? `bg-gradient-to-br ${difficulty.color} text-white`
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-2xl">{difficulty.icon}</div>
                    <span className="font-medium">{difficulty.name}</span>
                    <span className="text-sm">{difficulty.pointsPerQuestion} points/question</span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Quiz Information */}
          <div className="bg-white/10 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-400" />
              Quiz Information
            </h3>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <span>Up to 10 questions per quiz</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <span>15 seconds per question</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <span>Points vary by difficulty level</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <span>3 quizzes per day</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                <span>All questions fetched fresh from Open Trivia Database</span>
              </li>
            </ul>
          </div>

          {/* Start Button */}
          <motion.button
            onClick={startQuiz}
            disabled={!selectedCategory || !selectedDifficulty || quizzesRemaining <= 0 || loadingQuestions}
            whileHover={{ scale: selectedCategory && selectedDifficulty && quizzesRemaining > 0 && !loadingQuestions ? 1.05 : 1 }}
            whileTap={{ scale: selectedCategory && selectedDifficulty && quizzesRemaining > 0 && !loadingQuestions ? 0.95 : 1 }}
            className={`w-full py-4 rounded-xl font-bold text-xl transition-all duration-300 flex items-center justify-center gap-2 ${
              selectedCategory && selectedDifficulty && quizzesRemaining > 0 && !loadingQuestions
                ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-xl hover:shadow-blue-500/25'
                : 'bg-gray-500 text-gray-300 cursor-not-allowed'
            }`}
          >
            {loadingQuestions ? (
              <>
                <RefreshCw className="h-6 w-6 animate-spin" />
                Loading Questions...
              </>
            ) : (
              <>
                <Play className="h-6 w-6" />
                Start Quiz
              </>
            )}
          </motion.button>
        </motion.div>
      ) : quizFinished ? (
        // Quiz Results
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20"
        >
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Quiz Results</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-6xl mb-4">
                  {correctAnswers >= questions.length * 0.7 ? '🏆' : 
                   correctAnswers >= questions.length * 0.4 ? '👍' : '😢'}
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {correctAnswers} / {questions.length} Correct
                </h3>
                <p className="text-gray-300">
                  {correctAnswers === questions.length ? 'Perfect Score!' : 
                   correctAnswers >= questions.length * 0.7 ? 'Great job!' :
                   correctAnswers >= questions.length * 0.4 ? 'Good effort!' : 'Better luck next time!'}
                </p>
              </div>
              
              <div className="bg-white/10 rounded-xl p-6">
                <h4 className="text-lg font-bold text-white mb-4">Quiz Details</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Category:</span>
                    <span className="text-white font-medium">
                      {categories.find(c => c.id === selectedCategory)?.name || 'All Categories'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Difficulty:</span>
                    <span className="text-white font-medium">
                      {difficulties.find(d => d.id === selectedDifficulty)?.name || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Time Taken:</span>
                    <span className="text-white font-medium">
                      {Math.floor((quizEndTime - quizStartTime) / 1000)} seconds
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Points Earned:</span>
                    <span className="text-blue-400 font-bold">{score} points</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-400/20 to-cyan-500/20 rounded-xl p-6 border border-blue-400/30">
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-blue-400" />
                  Your Performance
                </h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-300">Accuracy</span>
                      <span className="text-white font-medium">
                        {Math.round((correctAnswers / questions.length) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-cyan-600 h-2.5 rounded-full" 
                        style={{ width: `${(correctAnswers / questions.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-300">Speed</span>
                      <span className="text-white font-medium">
                        {Math.round((quizEndTime - quizStartTime) / 1000 / questions.length)} sec/question
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                      <div 
                        className="bg-gradient-to-r from-green-500 to-emerald-600 h-2.5 rounded-full" 
                        style={{ width: `${100 - Math.min(100, ((quizEndTime - quizStartTime) / 1000 / questions.length / 15) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4">
                <motion.button
                  onClick={resetQuiz}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl font-medium transition-colors"
                >
                  New Quiz
                </motion.button>
                
                <motion.button
                  onClick={() => {
                    // Share quiz result
                    if (navigator.share) {
                      navigator.share({
                        title: 'My Trivia Quiz Result',
                        text: `I scored ${correctAnswers}/${questions.length} and earned ${score} points in the Trivia Quiz!`,
                        url: window.location.href
                      })
                    } else {
                      // Fallback to clipboard
                      navigator.clipboard.writeText(
                        `I scored ${correctAnswers}/${questions.length} and earned ${score} points in the Trivia Quiz!`
                      )
                      toast.success('Result copied to clipboard!')
                    }
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Trophy className="h-5 w-5" />
                  Share Result
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        // Quiz In Progress
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20"
        >
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-gray-300">Question {currentQuestionIndex + 1} of {questions.length}</span>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-400" />
                <span className={`font-medium ${timeLeft <= 5 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {timeLeft}s
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
              <div 
                className="bg-gradient-to-r from-blue-500 to-cyan-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Question */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-white mb-6">
              {questions[currentQuestionIndex]?.text}
            </h3>
            
            <div className="space-y-4">
              {questions[currentQuestionIndex]?.options.map((option, index) => (
                <motion.button
                  key={index}
                  onClick={() => handleAnswerSelection(index)}
                  disabled={selectedOption !== null}
                  whileHover={{ scale: selectedOption === null ? 1.02 : 1 }}
                  whileTap={{ scale: selectedOption === null ? 0.98 : 1 }}
                  className={`w-full p-4 rounded-xl text-left transition-all duration-300 ${
                    selectedOption === null
                      ? 'bg-white/10 hover:bg-white/20 text-white'
                      : selectedOption === index
                        ? isAnswerCorrect
                          ? 'bg-green-500/30 border border-green-500/50 text-white'
                          : 'bg-red-500/30 border border-red-500/50 text-white'
                        : index === questions[currentQuestionIndex].correctAnswer && selectedOption !== null
                          ? 'bg-green-500/30 border border-green-500/50 text-white'
                          : 'bg-white/10 text-gray-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      selectedOption === null
                        ? 'bg-white/20 text-white'
                        : selectedOption === index
                          ? isAnswerCorrect
                            ? 'bg-green-500 text-white'
                            : 'bg-red-500 text-white'
                          : index === questions[currentQuestionIndex].correctAnswer && selectedOption !== null
                            ? 'bg-green-500 text-white'
                            : 'bg-white/20 text-gray-400'
                    }`}>
                      {selectedOption === index
                        ? isAnswerCorrect
                          ? <CheckCircle className="h-5 w-5" />
                          : <XCircle className="h-5 w-5" />
                        : index === questions[currentQuestionIndex].correctAnswer && selectedOption !== null
                          ? <CheckCircle className="h-5 w-5" />
                          : String.fromCharCode(65 + index)}
                    </div>
                    <span className="flex-1">{option}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Score */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-400" />
              <span className="text-yellow-400 font-bold">{score} points</span>
            </div>
            
            <button
              onClick={handleNextQuestion}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              Skip
            </button>
          </div>
        </motion.div>
      )}

      {/* Quiz History */}
      {!quizStarted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20"
        >
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-blue-400" />
            Recent Quiz History
          </h3>
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {quizHistory.length > 0 ? (
              quizHistory.map((quiz) => (
                <div
                  key={quiz.id}
                  className="flex items-center justify-between p-4 bg-white/10 rounded-xl border border-white/20"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-medium">
                        {quiz.category || 'All Categories'}
                      </h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        quiz.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' :
                        quiz.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {quiz.difficulty || 'Unknown'}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm">
                      {new Date(quiz.created_at).toLocaleDateString()} • {quiz.correct_answers}/{quiz.total_questions} correct
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-blue-400 font-bold">{quiz.score} points</p>
                    <p className="text-gray-400 text-xs">{quiz.time_taken}s</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400">No quiz history yet</p>
                <p className="text-gray-500 text-sm">
                  Complete your first quiz to see your history
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Tutorial Modal */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowTutorial(false)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 max-w-lg w-full"
            >
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <Info className="h-6 w-6 text-blue-400" />
                How to Play Trivia Quiz
              </h2>
              
              <div className="space-y-4 text-gray-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">1</div>
                  <p>Select a category and difficulty level</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
                  <p>Answer questions within the time limit</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">3</div>
                  <p>Each correct answer earns you points based on difficulty</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">4</div>
                  <p>You have 15 seconds to answer each question</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">5</div>
                  <p>You can play 3 quizzes per day</p>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-blue-400/20 rounded-xl border border-blue-400/30">
                <p className="text-blue-300 text-sm font-medium">
                  💡 All questions are fetched fresh from the Open Trivia Database API for maximum variety!
                </p>
              </div>
              
              <button
                onClick={() => {
                  setShowTutorial(false)
                  localStorage.setItem('triviaQuizTutorialSeen', 'true')
                }}
                className="w-full mt-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl font-medium transition-colors"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default TriviaQuizPage