/**
 * Custom hook for call flow visualization
 */

import { useState } from 'react';
import { CallFlowData } from '@/types/analysis';
import { API_ENDPOINTS } from '@/lib/api';

export const useCallFlow = () => {
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [availableMethods, setAvailableMethods] = useState<string[]>([]);
  const [callFlowData, setCallFlowData] = useState<CallFlowData | null>(null);
  const [isLoadingCallFlow, setIsLoadingCallFlow] = useState(false);

  /**
   * Extract available methods from analysis results
   */
  const extractMethods = (results: any): string[] => {
    if (!results?.code_facts?.function_calls) {
      return [];
    }

    const methods = Array.from(new Set(
      results.code_facts.function_calls
        .map((call: any) => call.from_function)
        .filter((m: string) => m)
    )) as string[];

    return methods.sort();
  };

  /**
   * Update available methods from analysis results
   */
  const updateAvailableMethods = (results: any) => {
    const methods = extractMethods(results);
    setAvailableMethods(methods);

    // Auto-select first method if available
    if (methods.length > 0 && !selectedMethod) {
      setSelectedMethod(methods[0]);
    }
  };

  /**
   * Fetch call flow for a specific method
   */
  const fetchCallFlow = async (jobId: string, methodName: string, maxDepth: number = 5) => {
    if (!methodName) return;

    setIsLoadingCallFlow(true);
    try {
      const response = await fetch(
        API_ENDPOINTS.callflow(jobId, methodName, maxDepth)
      );

      if (!response.ok) {
        throw new Error('Failed to fetch call flow');
      }

      const data = await response.json();
      setCallFlowData(data);
    } catch (error) {
      console.error('Failed to fetch call flow:', error);
      setCallFlowData(null);
    } finally {
      setIsLoadingCallFlow(false);
    }
  };

  /**
   * Clear call flow selection
   */
  const clearCallFlow = () => {
    setSelectedMethod("");
    setCallFlowData(null);
  };

  return {
    selectedMethod,
    availableMethods,
    callFlowData,
    isLoadingCallFlow,
    setSelectedMethod,
    setAvailableMethods,
    setCallFlowData,
    updateAvailableMethods,
    fetchCallFlow,
    clearCallFlow,
  };
};
