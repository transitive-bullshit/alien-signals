import { activeEffectScope } from './effectScope.js';
import { checkDirty, clearTrack, Dependency, DirtyLevels, endTrack, IEffect, link, Link, startTrack, System } from './system.js';

export function effect(fn: () => void): Effect<void> {
	const e = new Effect(fn);
	e.run();
	return e;
}

export class Effect<T = any> implements IEffect, Dependency {
	nextNotify: IEffect | undefined = undefined;

	// Dependency
	subs: Link | undefined = undefined;
	subsTail: Link | undefined = undefined;
	lastTrackedId = 0;

	// Subscriber
	deps: Link | undefined = undefined;
	depsTail: Link | undefined = undefined;
	tracking = false;
	dirtyLevel: DirtyLevels = DirtyLevels.Dirty;

	constructor(
		public fn: () => T
	) {
		if (System.activeTrackId > 0) {
			link(this, System.activeSub!);
		} else if (activeEffectScope !== undefined) {
			link(this, activeEffectScope);
		}
	}

	notify(): void {
		let dirtyLevel = this.dirtyLevel;
		if (dirtyLevel > DirtyLevels.None) {
			if (dirtyLevel === DirtyLevels.MaybeDirty) {
				dirtyLevel = checkDirty(this.deps!)
					? DirtyLevels.Dirty
					: DirtyLevels.SideEffectsOnly;
			}
			if (dirtyLevel === DirtyLevels.Dirty) {
				this.run();
			} else {
				this.dirtyLevel = DirtyLevels.None;
				if (dirtyLevel === DirtyLevels.SideEffectsOnly) {
					let link = this.deps!;
					do {
						const dep = link.dep;
						if ('notify' in dep) {
							dep.notify();
						}
						link = link.nextDep!;
					} while (link !== undefined);
				}
			}
		}
	}

	run(): T {
		const prevSub = System.activeSub;
		const prevTrackId = System.activeTrackId;
		System.activeSub = this;
		System.activeTrackId = ++System.lastTrackId;
		startTrack(this);
		try {
			return this.fn();
		} finally {
			System.activeSub = prevSub;
			System.activeTrackId = prevTrackId;
			endTrack(this);
		}
	}

	stop(): void {
		if (this.deps !== undefined) {
			clearTrack(this.deps);
			this.deps = undefined;
			this.depsTail = undefined;
		}
		this.dirtyLevel = DirtyLevels.None;
	}
}
