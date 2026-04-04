import { useState, useCallback } from 'react'
import { api } from '../lib/api.js'

export function useAIPanel() {
  const [activeTab, setActiveTab] = useState('risks')
  const [open, setOpen] = useState(false)

  // AI Risk Alerts
  const [aiRisks, setAiRisks] = useState(null)
  const [aiRisksLoading, setAiRisksLoading] = useState(false)

  // AI Actions
  const [aiActions, setAiActions] = useState(null)
  const [aiActionsLoading, setAiActionsLoading] = useState(false)

  // NLQ
  const [nlqResult, setNlqResult] = useState(null)
  const [nlqLoading, setNlqLoading] = useState(false)

  // List Score
  const [listScore, setListScore] = useState(null)
  const [listScoreLoading, setListScoreLoading] = useState(false)

  const fetchAiRisks = useCallback(async () => {
    setAiRisksLoading(true)
    try {
      const res = await api.commandCenter.aiRisks()
      setAiRisks(res)
    } catch (e) {
      setAiRisks({ error: e.message })
    } finally {
      setAiRisksLoading(false)
    }
  }, [])

  const fetchAiActions = useCallback(async () => {
    setAiActionsLoading(true)
    try {
      const res = await api.commandCenter.aiActions()
      setAiActions(res)
    } catch (e) {
      setAiActions({ error: e.message })
    } finally {
      setAiActionsLoading(false)
    }
  }, [])

  const fetchNlq = useCallback(async (query) => {
    setNlqLoading(true)
    try {
      const res = await api.commandCenter.aiNLQ(query)
      setNlqResult(res)
    } catch (e) {
      setNlqResult({ error: e.message })
    } finally {
      setNlqLoading(false)
    }
  }, [])

  const fetchListScore = useCallback(async (studentId) => {
    setListScoreLoading(true)
    try {
      const res = await api.commandCenter.aiListScore(studentId)
      setListScore(res)
    } catch (e) {
      setListScore({ error: e.message })
    } finally {
      setListScoreLoading(false)
    }
  }, [])

  return {
    open, setOpen,
    activeTab, setActiveTab,
    aiRisks, aiRisksLoading, fetchAiRisks,
    aiActions, aiActionsLoading, fetchAiActions,
    nlqResult, nlqLoading, fetchNlq,
    listScore, listScoreLoading, fetchListScore,
  }
}
