import * as React from 'react'
import { AutocompleteProps } from '../index.d'
// @ts-ignore
import * as uuid4 from 'uuid/v4'

const initialState = {
  results: [],
  isLoading: false,
  error: null,
}

const cors =
  process.env.NODE_ENV !== 'production'
    ? 'https://cors-anywhere.herokuapp.com/'
    : ''

export default function useGoogleAutocomplete({
  apiKey,
  query,
  type = 'places',
  debounceMs = 400,
  options = {},
}: AutocompleteProps) {
  const [state, dispatch] = React.useReducer(reducer, initialState)

  // Refs for unique session_tokens, for billing purposes.
  // Reference: https://developers.google.com/places/web-service/autocomplete
  const sessionToken = React.useRef<string>(uuid4())
  const sessionTokenTimeout = React.useRef<number>()

  // AbortController to cancel window.fetch requests if component unmounts.
  const abortController = React.useRef<any>()
  const abortSignal = React.useRef<any>()

  React.useEffect(() => {
    // Setup a timer to reset our session_token every 3 minutes.
    // Reference: (https://stackoverflow.com/questions/50398801/how-long-do-the-new-places-api-session-tokens-last/50452233#50452233)
    sessionTokenTimeout.current = window.setInterval(resetSessionToken, 180000)
    // Setup an AbortController to cancel all http requests on unmount.
    abortController.current = new AbortController()
    abortSignal.current = abortController.current.signal

    // Cleanup clearInterval and abort any http calls on unmount.
    return () => {
      clearInterval(sessionTokenTimeout.current)
      abortController.current.abort()
    }
  }, [])

  // Flag to make sure our useEffect does not run on initial render.
  const initialRender = React.useRef<boolean>(false)
  // Debounce our search to only trigger an API call when user stops typing after (n)ms.
  const debouncedFn = React.useRef<any>()
  // Effect triggers on every query change.
  React.useEffect(() => {
    if (initialRender.current === false) {
      initialRender.current = true
      return
    }

    // Cancel previous debounced call.
    if (debouncedFn.current) debouncedFn.current.clear()

    dispatch({
      type: 'LOADING',
    })

    debouncedFn.current = debounce(() => {
      const types =
        options.types && type === 'places' ? `&types=${options.types}` : ''
      const strictbounds =
        options.strictbounds && types === 'places' ? `&strictbounds` : ''
      const offset =
        options.offset && type === 'query' ? `&offset=${options.offset}` : ''
      const language = options.language ? `&language=${options.language}` : ''
      const location = options.location ? `&location=${options.location}` : ''
      const radius = options.radius ? `&radius=${options.radius}` : ''

      const url = `${cors}https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${query}${types}${language}${location}${radius}${strictbounds}${offset}&key=${apiKey}&sessiontoken=${
        sessionToken.current
      }`

      fetch(url, { signal: abortSignal.current })
        .then(data => data.json())
        .then(data => {
          console.log('data', data)
          dispatch({
            type: data.status,
            payload: {
              data,
            },
          })
        })
        .catch(() => {
          // Component unmounted and API call cancelled.
        })
    }, debounceMs)

    debouncedFn.current()
  }, [
    query,
    debounceMs,
    apiKey,
    options.types,
    options.language,
    options.location,
    options.radius,
    options.strictbounds,
    options.offset,
    type,
  ])

  const getPlaceDetails = (
    placeId: string,
    placeDetailOptions: {
      fields?: string[]
      region?: string
      language?: string
    } = {}
  ) => {
    const fields = placeDetailOptions.fields
      ? `&fields=${placeDetailOptions.fields.join(',')}`
      : ''
    const region = placeDetailOptions.region
      ? `&region=${placeDetailOptions.region}`
      : ''
    // If no options are passed, we'll default to closured language option.
    const language = placeDetailOptions.language
      ? `&language=${placeDetailOptions.language}`
      : options.language
      ? `&language=${options.language}}`
      : ''

    const url = `${cors}https://maps.googleapis.com/maps/api/place/details/json?placeid=${placeId}${fields}${region}${language}&key=${apiKey}&sessiontoken=${
      sessionToken.current
    }`

    return fetch(url, { signal: abortSignal.current })
      .then(data => data.json())
      .then(data => {
        // Reset session token after we make a Place Details query.
        resetSessionToken()
        return data
      })
      .catch(() => {
        // Component unmounted and API call cancelled.
      })
  }

  const resetSessionToken = () => {
    sessionToken.current = uuid4()
  }

  return {
    results: state.results,
    isLoading: state.isLoading,
    error: state.error,
    getPlaceDetails,
  }
}

const reducer = (
  state: any,
  action: {
    type: string
    payload?: any
  }
) => {
  // All cases, beside 'LOADING', are status codes provided from Google Autocomplete API's response.
  switch (action.type) {
    case 'LOADING':
      return {
        ...state,
        isLoading: true,
      }
    case 'OK':
      return {
        ...state,
        results: action.payload.data,
        isLoading: false,
        error: null,
      }
    case 'ZERO_RESULTS':
      return {
        ...state,
        results: [],
        isLoading: false,
        error: null,
      }
    case 'INVALID_REQUEST':
      return {
        ...state,
        isLoading: false,
        error: null,
      }
    case 'REQUEST_DENIED':
      return {
        ...state,
        isLoading: false,
        error: `Invalid 'key' parameter`,
      }
    case 'UNKNOWN_ERROR':
      return {
        ...state,
        isLoading: false,
        error: `Unknown error, refresh and try again.`,
      }
    default:
      return state
  }
}

// Credit David Walsh (https://davidwalsh.name/javascript-debounce-function)

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func: () => any, wait: number, immediate?: boolean) {
  let timeout: any

  const executedFunction = function(this: any) {
    let context = this
    let args: any = arguments

    let later = function() {
      timeout = null
      if (!immediate) func.apply(context, args)
    }

    let callNow = immediate && !timeout

    clearTimeout(timeout)

    timeout = setTimeout(later, wait)

    if (callNow) func.apply(context, args)
  }

  executedFunction.clear = function() {
    clearTimeout(timeout)
    timeout = null
  }

  return executedFunction
}