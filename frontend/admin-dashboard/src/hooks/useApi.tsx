import { useState, useEffect } from 'react';

interface UseApiState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

export function useApi<T>(
    apiCall: () => Promise<T>,
    dependencies: any[] = []
): UseApiState<T> & { refetch: () => void } {
    const [state, setState] = useState<UseApiState<T>>({
        data: null,
        loading: true,
        error: null,
    });

    const fetchData = async () => {
        try {
            setState(prev => ({ ...prev, loading: true, error: null }));
            const data = await apiCall();
            setState({ data, loading: false, error: null });
        } catch (error) {
            setState({ data: null, loading: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    };

    useEffect(() => {
        fetchData();
    }, dependencies);

    return { ...state, refetch: fetchData };
}

export default useApi;