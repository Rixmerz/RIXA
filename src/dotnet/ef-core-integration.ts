import { DotNetDebugger } from './dotnet-debugger.js';
import type { DotNetDebuggerConfig } from './types.js';
import type { Logger } from '../utils/logger.js';

export class EFCoreDebugger extends DotNetDebugger {
  constructor() {
    super();
  }

  async inspectDbContext(): Promise<any> {
    // Get DbContext information
    const expression = `
      dbContext.GetType()
        .GetProperties()
        .Where(p => p.PropertyType.IsGenericType && 
                   p.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>))
        .Select(p => new { 
          Name = p.Name, 
          EntityType = p.PropertyType.GetGenericArguments()[0].Name 
        })
    `;
    
    return await this.evaluate('mock-session', expression);
  }

  async getChangeTracker(): Promise<any> {
    // Inspect change tracker
    const expression = `
      dbContext.ChangeTracker.Entries()
        .Select(e => new {
          Entity = e.Entity.GetType().Name,
          State = e.State.ToString(),
          OriginalValues = e.OriginalValues.Properties,
          CurrentValues = e.CurrentValues.Properties,
          ModifiedProperties = e.Properties.Where(p => p.IsModified).Select(p => p.Metadata.Name)
        })
    `;

    return await this.evaluate('mock-session', expression);
  }

  async inspectQuery(queryable: string): Promise<any> {
    // Get generated SQL for a query
    const expression = `
      ${queryable}.ToQueryString()
    `;

    return await this.evaluate('mock-session', expression);
  }

  async getExecutedQueries(): Promise<any> {
    // Get recently executed queries (requires logging enabled)
    const expression = `
      Microsoft.EntityFrameworkCore.Infrastructure.Internal.DiagnosticsLogger
        .GetExecutedCommands()
    `;

    return await this.evaluate('mock-session', expression);
  }

  async inspectModelMetadata(): Promise<any> {
    // Get model metadata
    const expression = `
      dbContext.Model.GetEntityTypes()
        .Select(e => new {
          Name = e.Name,
          Properties = e.GetProperties().Select(p => new {
            Name = p.Name,
            Type = p.ClrType.Name,
            IsKey = p.IsKey(),
            IsForeignKey = p.IsForeignKey(),
            IsRequired = !p.IsNullable
          }),
          Relationships = e.GetNavigations().Select(n => new {
            Name = n.Name,
            TargetEntity = n.TargetEntityType.Name,
            IsCollection = n.IsCollection
          })
        })
    `;
    
    return await this.evaluate('mock-session', expression);
  }
}