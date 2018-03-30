//
//  VipURLManager.h
//  VipVideo
//
//  Created by LiHongli on 2017/10/20.
//  Copyright © 2017年 SV. All rights reserved.
//

#import <Cocoa/Cocoa.h>

#define KHLVipVideoRequestSuccess       @"KHLVipVideoRequestSuccess"
#define KHLVipVideoWillChangeCurrentApi @"KHLVipVideoWillChangeCurrentApi"
#define KHLVipVideoDidChangeCurrentApi  @"KHLVipVideoDidChangeCurrentApi"
#define KHLVipVideoDidCopyCurrentURL    @"KHLVipVideoDidCopyCurrentURL"
#define KHLVipVideoGoBackCurrentURL     @"KHLVipVideoGoBackCurrentURL"
#define KHLVipVideoGoForwardCurrentURL  @"KHLVipVideoGoForwardCurrentURL"

@interface VipUrlItem:NSObject

@property (nonatomic, strong) NSString *title;
@property (nonatomic, strong) NSString *url;

+ (instancetype)createTitle:(NSString *)title url:(NSString *)url;

@end

/*--------------------------*/

@interface VipURLManager : NSObject

@property (nonatomic, strong) NSMutableArray *itemsArray;
@property (nonatomic, strong) NSMutableArray *platformItemsArray;

@property (nonatomic, strong) NSString *currentVipApi;
@property (nonatomic, assign) NSInteger currentIndex;

+ (instancetype)sharedInstance;
- (void)changeVideoItem:(VipUrlItem *)item;




- (void)configurationVipMenu:(NSMenu *)menu;

- (NSMenuItem *)configurationGoBackMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationGoForwardMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationQuitMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationChangeNextMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationChangeUpMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationShowMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationCreateMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationCopyMenuItem:(NSMenu *)menu;

+ (NSMenuItem *)addShowMenuItemTitle:(NSString *)title key:(unichar)key target:(id)target action:(SEL)action;

@end
