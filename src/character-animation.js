import * as THREE from "../vendor/three.module.js";
import { clone } from "../vendor/utils/SkeletonUtils.js";

const controllers = new WeakMap();

export function cloneAnimatedModel(template) {
  const visual = clone(template);
  visual.animations = template.animations;
  return visual;
}

export function attachCharacterAnimation(actor, visual) {
  const previous = controllers.get(actor);
  if (previous) {
    previous.mixer.stopAllAction();
    previous.mixer.uncacheRoot(previous.visual);
    controllers.delete(actor);
  }
  if (!visual.animations?.length) return;
  const mixer = new THREE.AnimationMixer(visual);
  const actions = Object.fromEntries(visual.animations.map(clip => [clip.name.toLowerCase(), mixer.clipAction(clip)]));
  const controller = { visual, mixer, actions, current: null, strike: null, position: actor.position.clone(), initialized: false };
  controllers.set(actor, controller);
  switchAction(controller, "idle");
}

function switchAction(controller, name) {
  const action = controller.actions[name];
  if (!action || controller.current === action) return;
  controller.current?.fadeOut(.1);
  action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(.1).play();
  controller.current = action;
}

export function queueCharacterStrike(actor, onContact) {
  const controller = controllers.get(actor);
  if (!controller?.actions.attack) return false;
  if (controller.strike || !actor.userData.alive) return true;
  const action = controller.actions.attack;
  controller.current?.stop();
  action.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  action.clampWhenFinished = true;
  controller.current = action;
  controller.strike = { elapsed: 0, contact: Math.min(.6, action.getClip().duration / 2), duration: action.getClip().duration, onContact };
  return true;
}

export function updateCharacterAnimation(actor, dt) {
  const controller = controllers.get(actor);
  if (!controller) return false;
  const distance = Math.hypot(actor.position.x - controller.position.x, actor.position.z - controller.position.z);
  controller.position.copy(actor.position);
  if (!actor.userData.alive) {
    controller.strike = null;
    controller.mixer.stopAllAction();
    controller.current = null;
    controller.initialized = false;
    return true;
  }
  if (dt <= 0) return true;
  const speed = controller.initialized ? distance / dt : 0;
  controller.initialized = true;
  const strike = controller.strike;
  if (!strike) {
    switchAction(controller, speed > .08 ? "walk" : "idle");
    if (controller.current === controller.actions.walk) controller.current.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 2.65, .2, 2));
  }
  controller.mixer.update(dt);
  if (strike) {
    strike.elapsed += dt;
    if (strike.elapsed >= strike.contact && strike.onContact) {
      const contact = strike.onContact;
      strike.onContact = null;
      contact();
    }
    if (strike.elapsed >= strike.duration) {
      controller.strike = null;
      switchAction(controller, speed > .08 ? "walk" : "idle");
    }
  }
  return true;
}
