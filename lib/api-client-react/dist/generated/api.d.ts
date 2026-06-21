import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { DevProfile, GetCoins200, GetCoinsParams, HealthStatus, ScannerStats, ScannerStatus } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetCoinsUrl: (params?: GetCoinsParams) => string;
/**
 * @summary Get all scanned coins
 */
export declare const getCoins: (params?: GetCoinsParams, options?: RequestInit) => Promise<GetCoins200>;
export declare const getGetCoinsQueryKey: (params?: GetCoinsParams) => readonly ["/api/coins", ...GetCoinsParams[]];
export declare const getGetCoinsQueryOptions: <TData = Awaited<ReturnType<typeof getCoins>>, TError = ErrorType<unknown>>(params?: GetCoinsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCoins>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCoins>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCoinsQueryResult = NonNullable<Awaited<ReturnType<typeof getCoins>>>;
export type GetCoinsQueryError = ErrorType<unknown>;
/**
 * @summary Get all scanned coins
 */
export declare function useGetCoins<TData = Awaited<ReturnType<typeof getCoins>>, TError = ErrorType<unknown>>(params?: GetCoinsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCoins>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetCoinStatsUrl: () => string;
/**
 * @summary Get scanner statistics
 */
export declare const getCoinStats: (options?: RequestInit) => Promise<ScannerStats>;
export declare const getGetCoinStatsQueryKey: () => readonly ["/api/coins/stats"];
export declare const getGetCoinStatsQueryOptions: <TData = Awaited<ReturnType<typeof getCoinStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCoinStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCoinStats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCoinStatsQueryResult = NonNullable<Awaited<ReturnType<typeof getCoinStats>>>;
export type GetCoinStatsQueryError = ErrorType<unknown>;
/**
 * @summary Get scanner statistics
 */
export declare function useGetCoinStats<TData = Awaited<ReturnType<typeof getCoinStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCoinStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetScannerStatusUrl: () => string;
/**
 * @summary Get scanner running status
 */
export declare const getScannerStatus: (options?: RequestInit) => Promise<ScannerStatus>;
export declare const getGetScannerStatusQueryKey: () => readonly ["/api/scanner/status"];
export declare const getGetScannerStatusQueryOptions: <TData = Awaited<ReturnType<typeof getScannerStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getScannerStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getScannerStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetScannerStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getScannerStatus>>>;
export type GetScannerStatusQueryError = ErrorType<unknown>;
/**
 * @summary Get scanner running status
 */
export declare function useGetScannerStatus<TData = Awaited<ReturnType<typeof getScannerStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getScannerStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getStartScannerUrl: () => string;
/**
 * @summary Start the scanner
 */
export declare const startScanner: (options?: RequestInit) => Promise<ScannerStatus>;
export declare const getStartScannerMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startScanner>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof startScanner>>, TError, void, TContext>;
export type StartScannerMutationResult = NonNullable<Awaited<ReturnType<typeof startScanner>>>;
export type StartScannerMutationError = ErrorType<unknown>;
/**
* @summary Start the scanner
*/
export declare const useStartScanner: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startScanner>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof startScanner>>, TError, void, TContext>;
export declare const getStopScannerUrl: () => string;
/**
 * @summary Stop the scanner
 */
export declare const stopScanner: (options?: RequestInit) => Promise<ScannerStatus>;
export declare const getStopScannerMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopScanner>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof stopScanner>>, TError, void, TContext>;
export type StopScannerMutationResult = NonNullable<Awaited<ReturnType<typeof stopScanner>>>;
export type StopScannerMutationError = ErrorType<unknown>;
/**
* @summary Stop the scanner
*/
export declare const useStopScanner: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopScanner>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof stopScanner>>, TError, void, TContext>;
export declare const getGetDevProfileUrl: (wallet: string) => string;
/**
 * @summary Get dev wallet stats
 */
export declare const getDevProfile: (wallet: string, options?: RequestInit) => Promise<DevProfile>;
export declare const getGetDevProfileQueryKey: (wallet: string) => readonly [`/api/dev/${string}`];
export declare const getGetDevProfileQueryOptions: <TData = Awaited<ReturnType<typeof getDevProfile>>, TError = ErrorType<unknown>>(wallet: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDevProfile>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDevProfile>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDevProfileQueryResult = NonNullable<Awaited<ReturnType<typeof getDevProfile>>>;
export type GetDevProfileQueryError = ErrorType<unknown>;
/**
 * @summary Get dev wallet stats
 */
export declare function useGetDevProfile<TData = Awaited<ReturnType<typeof getDevProfile>>, TError = ErrorType<unknown>>(wallet: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDevProfile>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map