import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { theme as t } from './tokens';

export function useReduceMotion() {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      receivedChange = true;
      if (active) setReduced(value);
    });
    void Promise.resolve().then(() => AccessibilityInfo.isReduceMotionEnabled()).then(value => {
      if (active && !receivedChange) setReduced(value);
    }).catch(() => {
      if (active && !receivedChange) setReduced(true);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

export function FadeIn({ children, replayKey }: { children: React.ReactNode; replayKey?: string }) {
  const reduced = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const [offset] = useState(() => new Animated.Value(0));
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const previousKey = useRef(replayKey);

  useEffect(() => {
    const replay = previousKey.current !== replayKey;
    previousKey.current = replayKey;

    if (reduced) {
      animation.current?.stop();
      animation.current = null;
      opacity.setValue(1);
      offset.setValue(0);
      return;
    }

    if (replay) {
      opacity.setValue(0);
      offset.setValue(4);
      const next = Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: t.motion.enter, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(offset, { toValue: 0, duration: t.motion.enter, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);
      animation.current = next;
      next.start(({ finished }) => {
        if (finished && animation.current === next) animation.current = null;
      });
    }

    return () => {
      animation.current?.stop();
      animation.current = null;
    };
  }, [offset, opacity, reduced, replayKey]);

  useEffect(() => () => animation.current?.stop(), []);

  return <Animated.View style={{ opacity, transform: [{ translateY: offset }] }}>{children}</Animated.View>;
}
