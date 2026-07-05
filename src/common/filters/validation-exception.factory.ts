import { BadRequestException, ValidationError } from '@nestjs/common';

function flatten(errors: ValidationError[], parent = ''): { field: string; errors: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, errors: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

export function validationExceptionFactory(errors: ValidationError[]) {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: flatten(errors),
  });
}
