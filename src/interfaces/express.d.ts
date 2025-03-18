// This file ensures Express namespace and types are properly recognized

declare global {
    namespace Express {
        interface Multer {
            File: import('multer').Multer extends { single(file: string): any }
                ? Parameters<
                      ReturnType<import('multer').Multer['single']>
                  >[0]['file']
                : never;
        }
    }
}

export {};
