import { Injectable } from '@nestjs/common';
import { PartsData } from './dto/auto-build.dto';

interface PartPool {
    CPU: any[];
    Motherboard: any[];
    RAM: any[];
    InternalHardDrive: any[];
    GraphicsCard: any[];
    PowerSupply: any[];
    Case: any[];
    CPUCooler: any[];
}

interface UserState {
  isReducePreferredParts: boolean;
  partPools: {
    saving: PartPool;
    performance: PartPool;
    popular: PartPool;
  };
  preferredPartsCache: {
    userInput: string;
    data: PartsData;
  };
  partCache: Map<string, any>;
  lastBudgetSnapshot: Record<string, Record<string, number>>;
  lastUserInputHash: string | null;
  removedCandidates: {
    performance: { [partLabel: string]: string[] };
    popular: { [partLabel: string]: string[] };
  };
  lastAccessTime: number;
}

@Injectable()
export class BuildStateService {
  private userStates = new Map<string, UserState>();
  
  // Time in milliseconds after which user state is considered stale (5 minutes)
  private readonly STATE_EXPIRY_TIME = 5 * 60 * 1000;

  constructor() {
    // Set up periodic cleanup to prevent memory leaks
    setInterval(() => this.cleanupStaleStates(), this.STATE_EXPIRY_TIME);
  }

  getUserState(userId: string): UserState {
    if (!this.userStates.has(userId)) {
      this.userStates.set(userId, this.createInitialState());
    } else {
      // Update the last access time
      this.userStates.get(userId).lastAccessTime = Date.now();
    }
    return this.userStates.get(userId);
  }

  private createInitialState(): UserState {
    return {
      isReducePreferredParts: false,
      partPools: {
        saving: this.createEmptyPartPool(),
        performance: this.createEmptyPartPool(),
        popular: this.createEmptyPartPool(),
      },
      preferredPartsCache: {
        userInput: '',
        data: this.createEmptyPartsData(),
      },
      partCache: new Map<string, any>(),
      lastBudgetSnapshot: {},
      lastUserInputHash: null,
      removedCandidates: {
        performance: {},
        popular: {},
      },
      lastAccessTime: Date.now(),
    };
  }

  private createEmptyPartPool() {
    return {
      CPU: [],
      Motherboard: [],
      RAM: [],
      InternalHardDrive: [],
      GraphicsCard: [],
      PowerSupply: [],
      Case: [],
      CPUCooler: [],
    };
  }

  private createEmptyPartsData() {
    return {
      CPU: [],
      Motherboard: [],
      RAM: [],
      InternalHardDrive: [],
      GraphicsCard: [],
      PowerSupply: [],
      Case: [],
      CPUCooler: [],
    };
  }

  private cleanupStaleStates() {
    const now = Date.now();
    for (const [userId, state] of this.userStates.entries()) {
      if (now - state.lastAccessTime > this.STATE_EXPIRY_TIME) {
        this.userStates.delete(userId);
      }
    }
  }
}