import type { Awaitable, MaybeRefOrGetter } from '@vueuse/shared'
import { toValue } from '@vueuse/shared'
import type { UnwrapNestedRefs } from 'vue-demi'
import { computed, nextTick, reactive, ref, watch } from 'vue-demi'
import { useElementVisibility } from '../useElementVisibility'
import type { UseScrollOptions } from '../useScroll'
import { useScroll } from '../useScroll'
import { resolveElement } from '../_resolve-element'

export interface UseInfiniteScrollOptions extends UseScrollOptions {
  /**
   * The minimum distance between the bottom of the element and the bottom of the viewport
   *
   * @default 0
   */
  distance?: number

  /**
   * The direction in which to listen the scroll.
   *
   * @default 'bottom'
   */
  direction?: 'top' | 'bottom' | 'left' | 'right'

  /**
   * The interval time between two load more (to avoid too many invokes).
   *
   * @default 100
   */
  interval?: number

  /**
   * Whether to load more immediately when mounted.
   *
   * @default true
   */
  immediate?: boolean
}

/**
 * Reactive infinite scroll.
 *
 * @see https://vueuse.org/useInfiniteScroll
 */
export function useInfiniteScroll(
  element: MaybeRefOrGetter<HTMLElement | SVGElement | Window | Document | null | undefined>,
  onLoadMore: (state: UnwrapNestedRefs<ReturnType<typeof useScroll>>) => Awaitable<void>,
  options: UseInfiniteScrollOptions = {},
) {
  const {
    direction = 'bottom',
    interval = 100,
    immediate = true,
  } = options

  const state = reactive(useScroll(
    element,
    {
      ...options,
      offset: {
        [direction]: options.distance ?? 0,
        ...options.offset,
      },
    },
  ))

  const promise = ref<any>()
  const isLoading = computed(() => !!promise.value)
  const isScrollY = computed(() => direction === 'bottom' || direction === 'top')

  // Document and Window cannot be observed by IntersectionObserver
  const observedElement = computed<HTMLElement | SVGElement | null | undefined>(() => {
    return resolveElement(toValue(element))
  })

  const isElementVisible = useElementVisibility(observedElement)

  function checkAndLoad() {
    state.measure()

    if (!observedElement.value || !isElementVisible.value)
      return

    const { scrollHeight, clientHeight, scrollWidth, clientWidth } = observedElement.value as HTMLElement
    const isNarrower = isScrollY
      ? scrollHeight <= clientHeight
      : scrollWidth <= clientWidth

    if (state.arrivedState[direction] || isNarrower) {
      if (!promise.value) {
        promise.value = Promise.all([
          onLoadMore(state),
          new Promise(resolve => setTimeout(resolve, interval)),
        ])
          .finally(() => {
            promise.value = null
            nextTick(() => {
              // Determine whether scrollHeight || scrollWidth has changed, if it changes, re-detection, otherwise give a prompt
              const { scrollHeight: currentScrollHeight, scrollWidth: currentScrollWidth } = observedElement.value as HTMLElement
              if ((isScrollY && currentScrollHeight !== scrollHeight) || (!isScrollY && currentScrollWidth !== scrollWidth))
                checkAndLoad()
              else
                console.warn(`In the current scroll direction: ${direction}, the scrollHeight || scrollWidth has not changed, please check!`)
            })
          })
      }
    }
  }

  watch(
    () => [state.arrivedState[direction], isElementVisible.value],
    checkAndLoad,
    { immediate },
  )

  return {
    isLoading,
  }
}
