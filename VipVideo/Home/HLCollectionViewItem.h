//
//  HLCollectionViewItem.h
//  VipVideo
//
//  Created by 李红力 on 2020/1/10.
//  Copyright © 2020 SV. All rights reserved.
//

#import <Cocoa/Cocoa.h>
#import "VipURLManager.h"

@interface NSVideoButton:NSButton

@property (nonatomic, strong) VipUrlItem * _Nullable model;

@end

NS_ASSUME_NONNULL_BEGIN

typedef void(^ItemClicked)(VipUrlItem *object, NSIndexPath *indexPath);

@interface HLCollectionViewItem : NSCollectionViewItem

@property (weak) IBOutlet NSTextField *textLabel;
@property (nonatomic, strong) NSVideoButton *button;
@property (nonatomic, strong) VipUrlItem *object;
@property (nonatomic, strong) ItemClicked itemBlock;
@property (nonatomic, strong) NSIndexPath *indexPath;

@end

NS_ASSUME_NONNULL_END
